import type { AppDatabase } from "@/db/database";
import { customers } from "@/data/customers";
import { orders } from "@/data/orders";

export function seedDemoData(db: AppDatabase) {
  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      account_status = excluded.account_status,
      risk_level = excluded.risk_level,
      lifetime_orders = excluded.lifetime_orders,
      created_at = excluded.created_at
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, customer_id, status, currency, subtotal_cents, shipping_cents, tax_cents,
      total_paid_cents, refunded_cents, placed_at, delivered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id,
      status = excluded.status,
      currency = excluded.currency,
      subtotal_cents = excluded.subtotal_cents,
      shipping_cents = excluded.shipping_cents,
      tax_cents = excluded.tax_cents,
      total_paid_cents = excluded.total_paid_cents,
      placed_at = excluded.placed_at,
      delivered_at = excluded.delivered_at
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (
      id, order_id, sku, name, quantity, unit_price_cents, final_sale, refundable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      order_id = excluded.order_id,
      sku = excluded.sku,
      name = excluded.name,
      quantity = excluded.quantity,
      unit_price_cents = excluded.unit_price_cents,
      final_sale = excluded.final_sale,
      refundable = excluded.refundable
  `);

  const transaction = db.transaction(() => {
    for (const customer of customers) {
      insertCustomer.run(
        customer.id,
        customer.name,
        customer.email,
        customer.accountStatus,
        customer.riskLevel,
        customer.lifetimeOrders,
        customer.lifetimeRefunds,
        customer.createdAt,
      );
    }

    for (const order of orders) {
      insertOrder.run(
        order.id,
        order.customerId,
        order.status,
        order.currency,
        order.subtotalCents,
        order.shippingCents,
        order.taxCents,
        order.totalPaidCents,
        order.refundedCents,
        order.placedAt,
        order.deliveredAt,
      );

      for (const item of order.items) {
        insertItem.run(
          item.id,
          order.id,
          item.sku,
          item.name,
          item.quantity,
          item.unitPriceCents,
          item.finalSale ? 1 : 0,
          item.refundable ? 1 : 0,
        );
      }
    }

    // The Phase 1 partial-refund fixture already carries $30.00 in refundedCents.
    // Seed the matching item-level ledger row so Phase 2 can enforce remaining quantity correctly.
    db.prepare(`
      INSERT OR IGNORE INTO refunds (
        id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
        quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'USD', 'COMPLETED', ?, ?)
    `).run(
      "ref_seed_partial",
      "seed:ord_demo_partial:item_006:1",
      "seeded-historical-refund",
      "cus_009",
      "ord_demo_partial",
      "item_006",
      1,
      "CHANGED_MIND",
      "UNOPENED",
      3000,
      JSON.stringify({
        decision: "APPROVE",
        refundAmountCents: 3000,
        checks: [],
        denialReasons: [],
      }),
      "2026-08-12T10:00:00Z",
    );
  });

  transaction();
}
