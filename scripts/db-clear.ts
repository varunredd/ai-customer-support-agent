import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { businessDataCounts, clearBusinessData } from "@/db/clear-business-data";
import { closeDatabaseForTests, createDatabase } from "@/db/database";

const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
if (filename === ":memory:") throw new Error("db:clear requires a file-backed DATABASE_PATH.");

closeDatabaseForTests();

const absolute = path.resolve(filename);
if (!fs.existsSync(absolute)) {
  console.log(`No database file at ${filename}. Nothing to clear.`);
  process.exit(0);
}

const db = createDatabase(filename);
try {
  clearBusinessData(db);
  console.log(`Cleared business data from ${filename}.`);
  console.log("Staff login credentials are unchanged because they live in environment variables, not SQLite.");
  console.table(businessDataCounts(db));
} finally {
  db.close();
}
