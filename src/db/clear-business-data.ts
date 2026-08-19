import type { AppDatabase } from "@/db/database";

const CLEAR_TABLES = [
  "support_messages",
  "support_sessions",
  "support_escalations",
  "agent_events",
  "notification_outbox",
  "operational_events",
  "integration_events",
  "request_rate_limits",
  "support_launch_tokens",
  "refunds",
  "agent_runs",
  "order_items",
  "orders",
  "customers",
  "refund_policy_versions",
] as const;

export function hasLegacySampleCatalog(db: AppDatabase) {
  const sampleCustomers = db.prepare(
    "SELECT COUNT(*) AS count FROM customers WHERE email LIKE '%@example.com'",
  ).get() as { count: number };
  const seededRefund = db.prepare(
    "SELECT COUNT(*) AS count FROM refunds WHERE id = 'ref_seed_partial'",
  ).get() as { count: number };
  return sampleCustomers.count > 0 || seededRefund.count > 0;
}

/** Wipe demo catalog rows left on persistent disks when sample seeding is disabled. */
export function purgeLegacySampleCatalog(db: AppDatabase) {
  if (process.env.SEED_SAMPLE_CATALOG?.trim().toLowerCase() === "true") return false;
  if (!hasLegacySampleCatalog(db)) return false;
  clearBusinessData(db);
  console.info("[jobform] Removed legacy sample catalog from SQLite because SEED_SAMPLE_CATALOG is not true.");
  return true;
}

export function clearBusinessData(db: AppDatabase) {
  const transaction = db.transaction(() => {
    db.pragma("foreign_keys = OFF");
    for (const table of CLEAR_TABLES) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.pragma("foreign_keys = ON");
  });
  transaction.immediate();
}

export function businessDataCounts(db: AppDatabase) {
  return Object.fromEntries(
    CLEAR_TABLES.map((table) => {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      return [table, row.count];
    }),
  );
}
