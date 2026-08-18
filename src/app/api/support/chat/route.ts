import { randomUUID } from "node:crypto";
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
  const message = error instanceof Error ? error.message : "The support agent failed unexpectedly.";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "SUPPORT_AGENT_FAILED";
  return { code, message };
}

export async function POST(request: Request) {
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
    detail = await getSupportSessionDetail(db, sessionId);
  } catch (error) {
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    return jsonError(500, "SESSION_READ_FAILED", "Unable to load support session.");
  }

  if (detail.session.status !== "OPEN") {
    return jsonError(409, "SESSION_CLOSED", "This support session is closed.");
  }

  const runId = `run_${randomUUID()}`;
  const sessions = new SupportSessionRepository(db);
  const customerMessage = sessions.appendMessage({
    sessionId,
    role: "CUSTOMER",
    content: message,
  });

  const demoFailure = body.demoFailure === "LOOKUP_ORDER_ONCE" && process.env.ENABLE_DEMO_FAILURES === "true"
    ? "lookup_order"
    : undefined;

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
            },
            {
              failOnceTool: demoFailure,
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
        } catch (error) {
          send("error", publicError(error));
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
    },
  });
}
