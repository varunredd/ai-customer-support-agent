import { getDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { requireStaffPermission } from "@/security/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "runs:view");
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const parsed = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isInteger(parsed) ? parsed : 50;
  const runs = new AdminReadRepository(getDatabase()).listRunSummaries(limit);
  return Response.json({ runs });
}
