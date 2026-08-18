import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { createDatabase } from "@/db/database";
import { seedDemoData } from "@/db/seed";

const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
if (filename === ":memory:") throw new Error("db:reset requires a file-backed DATABASE_PATH.");
const absolute = path.resolve(filename);
for (const suffix of ["", "-shm", "-wal"]) {
  const target = `${absolute}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}
const db = createDatabase(filename);
seedDemoData(db);
console.log(`Database reset and seeded: ${filename}`);
db.close();
