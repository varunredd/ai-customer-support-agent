import type { AppDatabase } from "@/db/database";
import { TenantRepository } from "@/repositories/tenant.repository";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

/** Default $100 auto-approve ceiling for managed merchants. */
export const DEFAULT_AUTO_APPROVE_MAX_CENTS = 10_000;

export function resolveAutoApproveMaxCents(db: AppDatabase, tenantId?: string): number {
  const envRaw = process.env.AUTO_APPROVE_MAX_CENTS?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }

  const id = resolveTenantId(db, tenantId);
  const tenant = new TenantRepository(db).findById(id);
  const fromSettings = tenant?.settings.autoApproveMaxCents;
  if (typeof fromSettings === "number" && Number.isInteger(fromSettings) && fromSettings >= 0) {
    return fromSettings;
  }
  return DEFAULT_AUTO_APPROVE_MAX_CENTS;
}
