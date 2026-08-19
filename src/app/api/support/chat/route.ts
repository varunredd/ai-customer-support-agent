import { randomUUID } from "node:crypto";
import { drainNotificationOutbox } from "@/services/notifications/notification.service";
import { operationalLog } from "@/lib/observability/system-logger";
import { assertSupportSessionAccess, SupportAccessError } from "@/security/support-access";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import { getDatabase } from "@/db/database";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import { OpenAIResponsesClient } from "@/integrations/openai/openai-responses.client";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { runSupportAgent } from "@/services/agent/support-agent.service";
import { getSupportSessionDetail, SupportSessionNotFoundError } from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function publicError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "SUPPORT_AGENT_FAILED";

  if (code === "OPENAI_API_KEY_MISSING") {
    return { code: "SUPPORT_AGENT_NOT_CONFIGURED", message: "The support agent is not configured for live requests." };
  }
  if (code === "MAX_AGENT_TURNS_EXCEEDED") {
    return { code, message: "The support agent could not finish this request safely. Please review the run and try again." };
  }
  if (code.startsWith("OPENAI_") || code === "OPERATION_TIMEOUT") {
    return { code: "SUPPORT_AGENT_TEMPORARILY_UNAVAILABLE", message: "The support agent is temporarily unavailable. Please review the run before trying again." };
  }

  return { code: "SUPPORT_AGENT_FAILED", message: "The support agent could not complete this request. Please review the run before trying again." };
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 128) || `req_${randomUUID()}`;
  let body: Record<string, unknown>;
  try {
    body = asObject(await request.json());
  } catch (error) {
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request body.");
  }

  let sessionId: string;
  let message: string;
  try {
    sessionId = readNonEmptyString(body, "sessionId", 128);
    message = readNonEmptyString(body, "message", 4000);
  } catch (error) {
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }

  const db = getDatabase();
  let detail;
  try {
    assertSupportSessionAccess(db, sessionId, request);
    detail = await getSupportSessionDetail(db, sessionId);
  } catch (error) {
    if (error instanceof SupportAccessError) return jsonError(error.code === "SUPPORT_SESSION_NOT_FOUND" ? 404 : 401, error.code, error.message);
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    return jsonError(500, "SESSION_READ_FAILED", "Unable to load support session.");
  }

  if (detail.session.status !== "OPEN") {
    return jsonError(409, "SESSION_CLOSED", "This support session is closed.");
  }

  try {
    consumeRateLimit(db, { key: `support-chat:${sessionId}`, limit: 20, windowMs: 60_000 });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: error.code, message: "Too many support requests. Please wait before trying again." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const runId = `run_${randomUUID()}`;
  const sessions = new SupportSessionRepository(db);
  const customerMessage = sessions.appendMessage({
    sessionId,
    role: "CUSTOMER",
    content: message,
  });
  const conversationHistory = sessions
    .listMessages(sessionId)
    .filter((entry) => entry.id !== customerMessage.id)
    .map((entry) => ({
      role: entry.role === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
      content: entry.content,
    }));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sse(event, data));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Client disconnected after the agent completed.
        }
      };

      send("run", { runId, sessionId, customerMessage });

      void (async () => {
        try {
          const model = new OpenAIResponsesClient();
          const result = await runSupportAgent(
            db,
            model,
            {
              runId,
              message,
              customerEmail: detail.customer.email,
              orderId: detail.order.id,
              conversationHistory,
            },
            {
              onEvent: async (event: PersistedAgentEvent) => {
                sessions.setMessageRunId(customerMessage.id, runId);
                send("agent_event", event);
              },
            },
          );

          const agentMessage = sessions.appendMessage({
            sessionId,
            runId,
            role: "AGENT",
            content: result.responseText,
          });
          send("assistant_message", agentMessage);
          send("done", { runId, status: result.status });
          operationalLog({
            severity: "INFO",
            source: "support-chat",
            code: "SUPPORT_RUN_COMPLETED",
            message: "Support agent run completed.",
            requestId,
            runId,
            metadata: { sessionId, status: result.status },
          }, db);
          if (process.env.NOTIFICATION_DELIVERY_MODE === "inline") {
            try {
              await drainNotificationOutbox(db, { limit: 10 });
            } catch {
              // Notification delivery is intentionally decoupled from the completed support workflow.
            }
          }
        } catch (error) {
          const publicFailure = publicError(error);
          operationalLog({
            severity: "ERROR",
            source: "support-chat",
            code: publicFailure.code,
            message: "Support agent run failed.",
            requestId,
            runId,
            metadata: { sessionId },
          }, db);
          send("error", publicFailure);
        } finally {
          finish();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
