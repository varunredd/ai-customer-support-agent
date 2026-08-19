import { getDatabase } from "@/db/database";
import { businessDataCounts, clearBusinessData } from "@/db/clear-business-data";
import { hasStaffApiAccess } from "@/security/admin-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }

  let confirm = false;
  try {
    const body = await request.json() as { confirm?: unknown };
    confirm = body.confirm === true;
  } catch {
    confirm = false;
  }
  if (!confirm) {
    return Response.json({ error: { code: "CONFIRMATION_REQUIRED", message: 'Send { "confirm": true } to clear business data.' } }, { status: 400 });
  }

  const db = getDatabase();
  const before = businessDataCounts(db);
  clearBusinessData(db);
  const after = businessDataCounts(db);
  return Response.json({ ok: true, before, after });
}
