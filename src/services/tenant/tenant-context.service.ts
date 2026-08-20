import type { AppDatabase } from "@/db/database";
import { TenantRepository } from "@/repositories/tenant.repository";

let cachedTenantId: string | null = null;

export function resetTenantContextCache() {
  cachedTenantId = null;
}

export function ensureDefaultTenant(db: AppDatabase): string {
  const tenant = new TenantRepository(db).ensureDefaultTenant();
  cachedTenantId = tenant.id;
  return tenant.id;
}

export function resolveTenantId(db: AppDatabase, tenantId?: string): string {
  if (tenantId?.trim()) return tenantId.trim();
  if (cachedTenantId) return cachedTenantId;
  return ensureDefaultTenant(db);
}
