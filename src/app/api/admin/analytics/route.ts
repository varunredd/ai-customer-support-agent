import { getDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "analytics:view");
  if (auth instanceof Response) return auth;
  const analytics = new AdminReadRepository(getDatabase()).getAnalyticsSnapshot();
  return Response.json({ analytics }, { headers: { "Cache-Control": "no-store" } });
}
