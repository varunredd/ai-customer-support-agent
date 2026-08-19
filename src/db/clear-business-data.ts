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
