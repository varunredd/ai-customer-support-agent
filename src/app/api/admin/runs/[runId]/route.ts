import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const auth = requireStaffPermission(request, "runs:view");
  if (auth instanceof Response) return auth;
  const { runId } = await context.params;
  const run = new AgentRunRepository(getDatabase()).findById(runId, true);
  if (!run) return jsonError(404, "AGENT_RUN_NOT_FOUND", "Agent run was not found.");
  return Response.json({ run });
}
