import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const auth = requireStaffPermission(request, "runs:view");
  if (auth instanceof Response) return auth;
  const { sessionId } = await context.params;
  const conversation = new SupportSessionRepository(getDatabase()).getConversation(sessionId);
  if (!conversation) {
    return jsonError(404, "CONVERSATION_NOT_FOUND", "That support conversation was not found.");
  }
  return Response.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
}
