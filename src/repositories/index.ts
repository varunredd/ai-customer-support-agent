import { getDatabase } from "@/db/database";
import { seedDemoData } from "@/db/seed";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";

let initialized = false;

export function getApplicationRepositories() {
  const db = getDatabase();
  if (!initialized) {
    const customerCount = db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
    if (customerCount.count === 0 && process.env.NODE_ENV !== "production") {
      seedDemoData(db);
    }
    initialized = true;
  }

  return {
    db,
    customerRepository: createSqliteCustomerRepository(db),
    orderRepository: createSqliteOrderRepository(db),
  };
}
