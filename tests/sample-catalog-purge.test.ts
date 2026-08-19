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
