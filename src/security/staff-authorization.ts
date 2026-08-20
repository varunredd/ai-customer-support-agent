import type { AppDatabase } from "@/db/database";
import type { StaffSession } from "@/domain/auth/types";
import { jsonError } from "@/lib/http";
import { hasControlAccess } from "@/security/admin-control";
import { readAdminSession } from "@/security/admin-session";
import { permissionsForRole, roleHasPermission, type StaffPermission } from "@/security/rbac";
import { ensureDefaultTenant } from "@/services/tenant/tenant-context.service";

export type StaffAuthContext =
  | { kind: "control" }
  | { kind: "session"; session: StaffSession };

export function resolveStaffAuth(request: Request): StaffAuthContext | Response {
  if (hasControlAccess(request, "ADMIN_CONTROL_TOKEN")) {
    return { kind: "control" };
  }
  const session = readAdminSession(request);
  if (!session) {
    return jsonError(401, "ADMIN_ACCESS_DENIED", "Staff sign-in is required.");
  }
  return { kind: "session", session };
}

export function staffHasPermission(auth: StaffAuthContext, permission: StaffPermission): boolean {
  if (auth.kind === "control") return true;
  return roleHasPermission(auth.session.role, permission);
}

export function requireStaffAuth(request: Request): StaffAuthContext | Response {
  return resolveStaffAuth(request);
}

export function requireStaffPermission(request: Request, permission: StaffPermission): StaffAuthContext | Response {
  const auth = resolveStaffAuth(request);
  if (auth instanceof Response) return auth;
  if (!staffHasPermission(auth, permission)) {
    return jsonError(403, "ADMIN_PERMISSION_DENIED", "You do not have permission to perform this action.");
  }
  return auth;
}

export function resolveStaffTenantId(db: AppDatabase, auth: StaffAuthContext): string {
  if (auth.kind === "session") return auth.session.tenantId;
  return ensureDefaultTenant(db);
}

export function staffSessionPayload(session: StaffSession) {
  return {
    email: session.email,
    role: session.role,
    userId: session.userId,
    tenantId: session.tenantId,
    permissions: permissionsForRole(session.role),
  };
}
