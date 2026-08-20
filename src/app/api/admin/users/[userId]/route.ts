import { getDatabase } from "@/db/database";
import { asObject, jsonError } from "@/lib/http";
import { requireStaffPermission, resolveStaffTenantId } from "@/security/staff-authorization";
import { StaffUserError, updateTenantStaffUser } from "@/services/auth/staff-user.service";
import type { StaffUserStatus } from "@/domain/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readOptionalStatus(body: Record<string, unknown>): StaffUserStatus | undefined {
  const value = body.status;
  if (value === undefined) return undefined;
  if (value === "ACTIVE" || value === "DISABLED") return value;
  throw new StaffUserError("STAFF_STATUS_INVALID", "Status must be ACTIVE or DISABLED.");
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = requireStaffPermission(request, "team:manage");
  if (auth instanceof Response) return auth;
  try {
    const { userId } = await context.params;
    const db = getDatabase();
    const tenantId = resolveStaffTenantId(db, auth);
    const body = asObject(await request.json());
    const actorUserId = auth.kind === "session" ? auth.session.userId : "";
    const role = typeof body.role === "string" ? body.role : undefined;
    const status = readOptionalStatus(body);
    const user = updateTenantStaffUser(db, tenantId, actorUserId, userId, { role, status });
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StaffUserError) {
      const status = error.code === "STAFF_USER_NOT_FOUND" ? 404 : 400;
      return jsonError(status, error.code, error.message);
    }
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }
}
