import { getDatabase } from "@/db/database";
import { AuditLogRepository } from "@/repositories/audit-log.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "audit:view");
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const parsed = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isInteger(parsed) ? parsed : 100;
  const events = new AuditLogRepository(getDatabase()).listRecent(limit);
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
}
