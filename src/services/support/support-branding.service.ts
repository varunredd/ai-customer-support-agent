import type { AppDatabase } from "@/db/database";
import { tenantBrandingFromRecord, type TenantBranding } from "@/domain/tenant/branding";
import { TenantRepository } from "@/repositories/tenant.repository";

export function getSupportBranding(db: AppDatabase): TenantBranding {
  return tenantBrandingFromRecord(new TenantRepository(db).ensureDefaultTenant());
}
