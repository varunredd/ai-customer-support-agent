import { getDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

let initialized = false;

export function getApplicationRepositories() {
  const db = getDatabase();
  const tenantId = resolveTenantId(db);
  if (!initialized) {
    const customerCount = db.prepare("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = ?").get(tenantId) as { count: number };
    if (customerCount.count === 0) {
      const allowSeed = process.env.SEED_SAMPLE_CATALOG?.trim().toLowerCase() === "true";
      if (allowSeed) seedCatalog(db, tenantId);
    }
    initialized = true;
  }

  return {
    db,
    tenantId,
    customerRepository: createSqliteCustomerRepository(db, tenantId),
    orderRepository: createSqliteOrderRepository(db, tenantId),
  };
}
