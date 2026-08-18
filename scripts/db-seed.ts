import "./load-env";
import { createDatabase } from "@/db/database";
import { seedDemoData } from "@/db/seed";

const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
const db = createDatabase(filename);
seedDemoData(db);
const counts = {
  customers: (db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count,
  orders: (db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count,
  refunds: (db.prepare("SELECT COUNT(*) AS count FROM refunds").get() as { count: number }).count,
};
console.log(`Demo data seeded: ${filename}`);
console.table(counts);
db.close();
