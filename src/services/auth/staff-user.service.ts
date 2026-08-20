import type { AppDatabase } from "@/db/database";
import type { StaffRole, StaffUser, StaffUserStatus } from "@/domain/auth/types";
import { UserRepository } from "@/repositories/user.repository";
import { hashPassword } from "@/security/password";
import { isTenantAssignableRole } from "@/security/rbac";

export class StaffUserError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function assertAssignableRole(role: string): StaffRole {
  if (!isTenantAssignableRole(role)) {
    throw new StaffUserError("STAFF_ROLE_INVALID", "That staff role cannot be assigned.");
  }
  return role;
}

function assertPassword(password: string) {
  if (password.length < 12) {
    throw new StaffUserError("STAFF_PASSWORD_WEAK", "Password must be at least 12 characters.");
  }
}

export function listTenantStaffUsers(db: AppDatabase, tenantId: string): StaffUser[] {
  return new UserRepository(db).listByTenant(tenantId);
}

export function createTenantStaffUser(
  db: AppDatabase,
  tenantId: string,
  input: { email: string; password: string; role: string },
): StaffUser {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new StaffUserError("STAFF_EMAIL_INVALID", "A valid email address is required.");
  }
  assertPassword(input.password);
  const role = assertAssignableRole(input.role);
  const repo = new UserRepository(db);
  if (repo.findByEmail(tenantId, email)) {
    throw new StaffUserError("STAFF_EMAIL_EXISTS", "A staff account with that email already exists.");
  }
  return repo.createUser({
    tenantId,
    email,
    passwordHash: hashPassword(input.password),
    role,
  });
}

export function updateTenantStaffUser(
  db: AppDatabase,
  tenantId: string,
  actorUserId: string,
  userId: string,
  patch: { role?: string; status?: StaffUserStatus },
): StaffUser {
  if (userId === actorUserId) {
    if (patch.status === "DISABLED") {
      throw new StaffUserError("STAFF_SELF_DISABLE", "You cannot disable your own account.");
    }
    if (patch.role && patch.role !== undefined) {
      throw new StaffUserError("STAFF_SELF_ROLE", "You cannot change your own role.");
    }
  }

  const normalized: { role?: StaffRole; status?: StaffUserStatus } = {};
  if (patch.role !== undefined) normalized.role = assertAssignableRole(patch.role);
  if (patch.status !== undefined) {
    if (patch.status !== "ACTIVE" && patch.status !== "DISABLED") {
      throw new StaffUserError("STAFF_STATUS_INVALID", "Status must be ACTIVE or DISABLED.");
    }
    normalized.status = patch.status;
  }
  if (!normalized.role && !normalized.status) {
    throw new StaffUserError("STAFF_UPDATE_EMPTY", "Provide a role or status to update.");
  }

  const repo = new UserRepository(db);
  if (!repo.findByIdForTenant(tenantId, userId)) {
    throw new StaffUserError("STAFF_USER_NOT_FOUND", "Staff user was not found.");
  }
  return repo.updateUser(tenantId, userId, normalized);
}
