import { getDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";

let initialized = false;

export function getApplicationRepositories() {
  const db = getDatabase();
  if (!initialized) {
    const customerCount = db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
    if (customerCount.count === 0) {
      const allowSeed = process.env.SEED_SAMPLE_CATALOG?.trim().toLowerCase() === "true";
      if (allowSeed) seedCatalog(db);
    }
    initialized = true;
  }

  return {
    db,
    customerRepository: createSqliteCustomerRepository(db),
    orderRepository: createSqliteOrderRepository(db),
  };
}
