import type { AppDatabase } from "@/db/database";
import type { StaffUser } from "@/domain/auth/types";
import { UserRepository } from "@/repositories/user.repository";
import { verifyPassword } from "@/security/password";
import { AdminAuthenticationError } from "@/security/admin-session";
import { ensureDefaultTenant } from "@/services/tenant/tenant-context.service";

export function authenticateStaffUser(db: AppDatabase, email: string, password: string): StaffUser {
  const tenantId = ensureDefaultTenant(db);
  const user = new UserRepository(db).findByEmail(tenantId, email);
  if (!user || user.status !== "ACTIVE") {
    throw new AdminAuthenticationError("ADMIN_CREDENTIALS_INVALID", "Email or password is incorrect.");
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throw new AdminAuthenticationError("ADMIN_CREDENTIALS_INVALID", "Email or password is incorrect.");
  }
  const { passwordHash: _passwordHash, ...staffUser } = user;
  return staffUser;
}
