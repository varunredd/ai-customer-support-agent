import { getDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "refund:view");
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const parsed = Number.parseInt(url.searchParams.get("limit") ?? "80", 10);
  const limit = Number.isInteger(parsed) ? parsed : 80;
  const decisions = new AdminReadRepository(getDatabase()).listDecisions(limit);
  return Response.json({ decisions }, { headers: { "Cache-Control": "no-store" } });
}
