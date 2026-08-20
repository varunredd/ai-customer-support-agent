import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const auth = requireStaffPermission(request, "runs:view");
  if (auth instanceof Response) return auth;
  const { runId } = await context.params;
  const repo = new AgentRunRepository(getDatabase());
  const initial = repo.findById(runId, false);
  if (!initial) return jsonError(404, "AGENT_RUN_NOT_FOUND", "Agent run was not found.");

  const url = new URL(request.url);
  const parsedAfter = Number.parseInt(url.searchParams.get("after") ?? "0", 10);
  let after = Number.isInteger(parsedAfter) && parsedAfter > 0 ? parsedAfter : 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let timer: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Connection already closed by the client.
        }
      };

      const emit = () => {
        if (closed) return;
        const events = repo.listEventsAfter(runId, after);
        for (const event of events) {
          controller.enqueue(sse("agent_event", event));
          after = event.sequence;
        }

        const run = repo.findById(runId, false);
        if (!run) {
          controller.enqueue(sse("run_status", { runId, status: "MISSING" }));
          close();
          return;
        }
        controller.enqueue(sse("run_status", { runId, status: run.status, completedAt: run.completedAt }));
        if (run.status !== "IN_PROGRESS") close();
      };

      request.signal.addEventListener("abort", close, { once: true });
      emit();
      if (!closed) timer = setInterval(emit, 400);
    },
    cancel() {
      // The abort handler above clears the polling timer.
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
