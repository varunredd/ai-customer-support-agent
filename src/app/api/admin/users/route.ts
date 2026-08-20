import { getDatabase } from "@/db/database";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import { requireStaffPermission, resolveStaffTenantId } from "@/security/staff-authorization";
import { createTenantStaffUser, listTenantStaffUsers, StaffUserError } from "@/services/auth/staff-user.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "team:manage");
  if (auth instanceof Response) return auth;
  const db = getDatabase();
  const tenantId = resolveStaffTenantId(db, auth);
  return Response.json({ users: listTenantStaffUsers(db, tenantId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "team:manage");
  if (auth instanceof Response) return auth;
  try {
    const db = getDatabase();
    const tenantId = resolveStaffTenantId(db, auth);
    const body = asObject(await request.json());
    const email = readNonEmptyString(body, "email", 320);
    const password = readNonEmptyString(body, "password", 256);
    const role = readNonEmptyString(body, "role", 64);
    const user = createTenantStaffUser(db, tenantId, { email, password, role });
    return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StaffUserError) {
      const status = error.code === "STAFF_EMAIL_EXISTS" ? 409 : 400;
      return jsonError(status, error.code, error.message);
    }
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }
}
