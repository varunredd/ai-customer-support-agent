import { getDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "integrations:manage");
  if (auth instanceof Response) return auth;
  const integrations = new AdminReadRepository(getDatabase()).getIntegrationStatus();
  return Response.json({ integrations }, { headers: { "Cache-Control": "no-store" } });
}
