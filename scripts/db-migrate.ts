import "./load-env";
import { createDatabase } from "@/db/database";

const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
const db = createDatabase(filename);
const versions = db.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version").all();
console.log(`Database ready: ${filename}`);
console.table(versions);
db.close();
