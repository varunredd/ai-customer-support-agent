import assert from "node:assert/strict";
import test from "node:test";
import { hasLegacySampleCatalog, purgeLegacySampleCatalog } from "@/db/clear-business-data";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";

test("purgeLegacySampleCatalog removes demo rows when sample seeding is disabled", () => {
  process.env.SEED_SAMPLE_CATALOG = "false";
  const db = createDatabase(":memory:");
  seedCatalog(db);
  assert.equal(hasLegacySampleCatalog(db), true);
  assert.equal(purgeLegacySampleCatalog(db), true);
  assert.equal(hasLegacySampleCatalog(db), false);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count, 0);
  db.close();
  delete process.env.SEED_SAMPLE_CATALOG;
});

test("purgeLegacySampleCatalog is a no-op when sample seeding is enabled", () => {
  process.env.SEED_SAMPLE_CATALOG = "true";
  const db = createDatabase(":memory:");
  seedCatalog(db);
  assert.equal(purgeLegacySampleCatalog(db), false);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count, 15);
  db.close();
  delete process.env.SEED_SAMPLE_CATALOG;
});

test("store-synced @example.com customers are not treated as the seed catalog", () => {
  process.env.SEED_SAMPLE_CATALOG = "false";
  const db = createDatabase(":memory:");
  const tenantId = (db.prepare("SELECT id FROM tenants LIMIT 1").get() as { id: string }).id;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO customers (id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at)
    VALUES (?, ?, 'Maya Returns', 'maya.returns@example.com', 'ACTIVE', 'LOW', 2, 0, ?)
  `).run("cus_store_maya", tenantId, now);
  assert.equal(hasLegacySampleCatalog(db), false);
  assert.equal(purgeLegacySampleCatalog(db), false);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count, 1);
  db.close();
  delete process.env.SEED_SAMPLE_CATALOG;
});

test("purgeLegacySampleCatalog never wipes live support sessions or escalations", () => {
  process.env.SEED_SAMPLE_CATALOG = "false";
  const db = createDatabase(":memory:");
  seedCatalog(db);
  const tenantId = (db.prepare("SELECT id FROM tenants LIMIT 1").get() as { id: string }).id;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO support_sessions (id, tenant_id, customer_id, order_id, status, created_at, updated_at)
    VALUES ('ses_demo', ?, 'cus_001', 'ord_8901', 'OPEN', ?, ?)
  `).run(tenantId, now, now);
  db.prepare(`
    INSERT INTO agent_runs (
      id, tenant_id, status, model, input_text, customer_id, order_id, started_at
    ) VALUES ('run_demo', ?, 'COMPLETED', 'test', 'help', 'cus_001', 'ord_8901', ?)
  `).run(tenantId, now);
  db.prepare(`
    INSERT INTO support_escalations (
      id, tenant_id, run_id, customer_id, order_id, reason_code, summary, priority, status, created_at, updated_at
    ) VALUES ('esc_demo', ?, 'run_demo', 'cus_001', 'ord_8901', 'POLICY', 'Demo escalation', 'NORMAL', 'OPEN', ?, ?)
  `).run(tenantId, now, now);

  assert.equal(purgeLegacySampleCatalog(db), false);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM support_sessions").get() as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM support_escalations").get() as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count, 15);
  db.close();
  delete process.env.SEED_SAMPLE_CATALOG;
});
