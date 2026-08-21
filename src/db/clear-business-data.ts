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

/** Fingerprint of the built-in `seedCatalog()` fixture — not store-synced `@example.com` emails. */
export function hasLegacySampleCatalog(db: AppDatabase) {
  const seededRefund = db.prepare(
    "SELECT COUNT(*) AS count FROM refunds WHERE id = 'ref_seed_partial'",
  ).get() as { count: number };
  if (seededRefund.count > 0) return true;

  const seedMaya = db.prepare(
    "SELECT COUNT(*) AS count FROM customers WHERE id = 'cus_001' AND email = 'maya@example.com' COLLATE NOCASE",
  ).get() as { count: number };
  return seedMaya.count > 0;
}

function hasLiveSupportActivity(db: AppDatabase) {
  const sessions = db.prepare("SELECT COUNT(*) AS count FROM support_sessions").get() as { count: number };
  const escalations = db.prepare("SELECT COUNT(*) AS count FROM support_escalations").get() as { count: number };
  return sessions.count > 0 || escalations.count > 0;
}

/**
 * Wipe leftover `seedCatalog()` rows when sample seeding is disabled.
 * Never treat store-synced `@example.com` customers as the sample catalog, and never
 * destroy live support sessions/escalations on boot (that wiped demos mid-run).
 */
export function purgeLegacySampleCatalog(db: AppDatabase) {
  if (process.env.SEED_SAMPLE_CATALOG?.trim().toLowerCase() === "true") return false;
  if (!hasLegacySampleCatalog(db)) return false;
  if (hasLiveSupportActivity(db)) {
    console.warn(
      "[jobform] Skipping legacy sample catalog purge because support sessions or escalations exist. Keep SEED_SAMPLE_CATALOG=true for demos, or run `npm run db:clear` intentionally.",
    );
    return false;
  }
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
