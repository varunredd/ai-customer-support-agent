import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS, MIGRATION_TABLE_SQL } from "@/db/schema";
import { purgeLegacySampleCatalog } from "@/db/clear-business-data";
import { seedCatalog } from "@/db/seed";

export type AppDatabase = Database.Database;

function ensureParentDirectory(filename: string) {
  if (filename === ":memory:") return;
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
}

export function createDatabase(filename: string): AppDatabase {
  ensureParentDirectory(filename);
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrateDatabase(db);
  return db;
}

export function migrateDatabase(db: AppDatabase) {
  db.exec(MIGRATION_TABLE_SQL);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>).map(
      (row) => row.version,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    applyMigration.immediate();
  }
}

let singleton: AppDatabase | null = null;

export function getDatabase(): AppDatabase {
  if (!singleton) {
    const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
    singleton = createDatabase(filename);
    purgeLegacySampleCatalog(singleton);
    const customerCount = (singleton.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count;
    if (customerCount === 0) {
      const allowSeed = process.env.SEED_SAMPLE_CATALOG?.trim().toLowerCase() === "true";
      if (allowSeed) seedCatalog(singleton);
    }
  }
  return singleton;
}

export function closeDatabaseForTests() {
  singleton?.close();
  singleton = null;
}
