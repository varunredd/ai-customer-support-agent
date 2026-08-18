import "./load-env";
import { createDatabase } from "@/db/database";

function scalar(db: ReturnType<typeof createDatabase>, sql: string): number {
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const filename = process.env.DATABASE_PATH?.trim() || ".data/jobform-support.sqlite";
const db = createDatabase(filename);

try {
  const counts = {
    customers: scalar(db, "SELECT COUNT(*) AS count FROM customers"),
    orders: scalar(db, "SELECT COUNT(*) AS count FROM orders"),
    orderItems: scalar(db, "SELECT COUNT(*) AS count FROM order_items"),
    refunds: scalar(db, "SELECT COUNT(*) AS count FROM refunds"),
    agentRuns: scalar(db, "SELECT COUNT(*) AS count FROM agent_runs"),
    agentEvents: scalar(db, "SELECT COUNT(*) AS count FROM agent_events"),
    supportSessions: scalar(db, "SELECT COUNT(*) AS count FROM support_sessions"),
    supportMessages: scalar(db, "SELECT COUNT(*) AS count FROM support_messages"),
  };

  assertEqual(counts.customers, 15, "CRM customer fixture count drifted");
  assertEqual(counts.orders, 6, "Order fixture count drifted");
  assertEqual(counts.orderItems, 6, "Order-item fixture count drifted");
  assertEqual(counts.refunds, 1, "Demo reset must retain only the seeded historical refund");
  assertEqual(counts.agentRuns, 0, "Demo reset must remove runtime agent runs");
  assertEqual(counts.agentEvents, 0, "Demo reset must remove runtime agent events");
  assertEqual(counts.supportSessions, 0, "Demo reset must remove support sessions");
  assertEqual(counts.supportMessages, 0, "Demo reset must remove support messages");

  const seededRefund = db.prepare(`
    SELECT id, run_id, order_id, item_id, quantity, amount_cents, status
    FROM refunds
  `).get() as {
    id: string;
    run_id: string | null;
    order_id: string;
    item_id: string;
    quantity: number;
    amount_cents: number;
    status: string;
  } | undefined;

  if (!seededRefund) throw new Error("Seeded partial-refund ledger row is missing.");
  assertEqual(seededRefund.id, "ref_seed_partial", "Unexpected seeded refund ID");
  assertEqual(seededRefund.run_id, null, "Historical seeded refund must not belong to an agent run");
  assertEqual(seededRefund.order_id, "ord_demo_partial", "Seeded refund order drifted");
  assertEqual(seededRefund.item_id, "item_006", "Seeded refund item drifted");
  assertEqual(seededRefund.quantity, 1, "Seeded refund quantity drifted");
  assertEqual(seededRefund.amount_cents, 3000, "Seeded refund amount drifted");
  assertEqual(seededRefund.status, "COMPLETED", "Seeded refund status drifted");

  const expectedOrders = [
    ["ord_demo_approve", "cus_001", 0],
    ["ord_demo_final_sale", "cus_002", 0],
    ["ord_demo_partial", "cus_009", 3000],
  ] as const;

  for (const [orderId, customerId, refundedCents] of expectedOrders) {
    const row = db.prepare(`
      SELECT customer_id, refunded_cents
      FROM orders
      WHERE id = ?
    `).get(orderId) as { customer_id: string; refunded_cents: number } | undefined;

    if (!row) throw new Error(`Required demo order ${orderId} is missing.`);
    assertEqual(row.customer_id, customerId, `${orderId} customer ownership drifted`);
    assertEqual(row.refunded_cents, refundedCents, `${orderId} refunded balance drifted`);
  }

  console.log("Demo fixture certification passed.");
  console.table(counts);
  console.log(`Database: ${filename}`);
} finally {
  db.close();
}
