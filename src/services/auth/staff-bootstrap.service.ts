import type { AppDatabase } from "@/db/database";
import { UserRepository } from "@/repositories/user.repository";
import { staffCredentialsConfigured } from "@/security/admin-session";
import { hashPassword } from "@/security/password";
import { ensureDefaultTenant } from "@/services/tenant/tenant-context.service";

export function ensureBootstrapStaffUser(db: AppDatabase): void {
  if (!staffCredentialsConfigured()) return;

  const tenantId = ensureDefaultTenant(db);
  const email = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD!;
  const repo = new UserRepository(db);
  const existing = repo.findByEmail(tenantId, email);
  if (existing) return;

  repo.createUser({
    tenantId,
    email,
    passwordHash: hashPassword(password),
    role: "MERCHANT_ADMIN",
  });
}
