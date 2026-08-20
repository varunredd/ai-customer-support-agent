import { getDatabase } from "@/db/database";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "runs:view");
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const parsed = Number.parseInt(url.searchParams.get("limit") ?? "80", 10);
  const limit = Number.isInteger(parsed) ? parsed : 80;
  const conversations = new SupportSessionRepository(getDatabase()).listConversations(limit);
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
