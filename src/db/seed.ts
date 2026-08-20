import type { AppDatabase } from "@/db/database";
import { customers } from "@/data/customers";
import { orders } from "@/data/orders";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export function seedCatalog(db: AppDatabase, tenantId?: string) {
  const tenant = resolveTenantId(db, tenantId);
  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      email = excluded.email,
      account_status = excluded.account_status,
      risk_level = excluded.risk_level,
      lifetime_orders = excluded.lifetime_orders,
      created_at = excluded.created_at
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, tenant_id, customer_id, status, currency, subtotal_cents, shipping_cents, tax_cents,
      total_paid_cents, refunded_cents, placed_at, delivered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
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
        tenant,
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
        tenant,
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

    // Seed the matching item-level ledger row so remaining quantity is enforced.
    db.prepare(`
      INSERT OR IGNORE INTO refunds (
        id, tenant_id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
        quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'USD', 'COMPLETED', ?, ?)
    `).run(
      "ref_seed_partial",
      tenant,
      "seed:ord_8906:item_006:1",
      "seeded-historical-refund",
      "cus_009",
      "ord_8906",
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
