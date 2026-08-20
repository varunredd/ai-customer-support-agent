import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { AccountStatus, Customer, Order, OrderItem, OrderStatus, RiskLevel } from "@/domain/refunds/types";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export class BusinessSyncValidationError extends Error {
  readonly code = "BUSINESS_SYNC_VALIDATION_FAILED";
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BusinessSyncValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new BusinessSyncValidationError(`${label} is invalid.`);
  return value.trim();
}

function iso(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  const raw = text(value, label, 64);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new BusinessSyncValidationError(`${label} must be an ISO-8601 timestamp.`);
  return parsed.toISOString();
}

function integer(value: unknown, label: string, min = 0) {
  if (!Number.isInteger(value) || (value as number) < min) throw new BusinessSyncValidationError(`${label} must be an integer >= ${min}.`);
  return value as number;
}

function enumValue<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new BusinessSyncValidationError(`${label} is invalid.`);
  return value as T;
}

const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED"] as const satisfies readonly AccountStatus[];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly RiskLevel[];
const ORDER_STATUSES = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const satisfies readonly OrderStatus[];

function parseCustomer(value: unknown): Customer {
  const input = object(value, "customer");
  const email = text(input.email, "customer.email", 320).toLowerCase();
  if (!email.includes("@")) throw new BusinessSyncValidationError("customer.email is invalid.");
  return {
    id: text(input.id, "customer.id", 128),
    name: text(input.name, "customer.name", 160),
    email,
    accountStatus: enumValue(input.accountStatus, "customer.accountStatus", ACCOUNT_STATUSES),
    riskLevel: enumValue(input.riskLevel, "customer.riskLevel", RISK_LEVELS),
    lifetimeOrders: integer(input.lifetimeOrders, "customer.lifetimeOrders"),
    lifetimeRefunds: integer(input.lifetimeRefunds, "customer.lifetimeRefunds"),
    createdAt: iso(input.createdAt, "customer.createdAt")!,
  };
}

function parseItem(value: unknown, index: number): OrderItem {
  const input = object(value, `orders[].items[${index}]`);
  if (typeof input.finalSale !== "boolean" || typeof input.refundable !== "boolean") {
    throw new BusinessSyncValidationError(`orders[].items[${index}] boolean flags are invalid.`);
  }
  return {
    id: text(input.id, `orders[].items[${index}].id`, 128),
    sku: text(input.sku, `orders[].items[${index}].sku`, 128),
    name: text(input.name, `orders[].items[${index}].name`, 256),
    quantity: integer(input.quantity, `orders[].items[${index}].quantity`, 1),
    unitPriceCents: integer(input.unitPriceCents, `orders[].items[${index}].unitPriceCents`),
    finalSale: input.finalSale,
    refundable: input.refundable,
  };
}

function parseOrder(value: unknown, customerId: string, index: number): Order {
  const input = object(value, `orders[${index}]`);
  if (input.currency !== "USD") throw new BusinessSyncValidationError(`orders[${index}].currency must be USD.`);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new BusinessSyncValidationError(`orders[${index}].items must contain 1-100 items.`);
  }
  const parsedCustomerId = text(input.customerId, `orders[${index}].customerId`, 128);
  if (parsedCustomerId !== customerId) throw new BusinessSyncValidationError(`orders[${index}] does not belong to the supplied customer.`);
  return {
    id: text(input.id, `orders[${index}].id`, 128),
    customerId,
    status: enumValue(input.status, `orders[${index}].status`, ORDER_STATUSES),
    currency: "USD",
    subtotalCents: integer(input.subtotalCents, `orders[${index}].subtotalCents`),
    shippingCents: integer(input.shippingCents, `orders[${index}].shippingCents`),
    taxCents: integer(input.taxCents, `orders[${index}].taxCents`),
    totalPaidCents: integer(input.totalPaidCents, `orders[${index}].totalPaidCents`),
    refundedCents: integer(input.refundedCents, `orders[${index}].refundedCents`),
    placedAt: iso(input.placedAt, `orders[${index}].placedAt`)!,
    deliveredAt: iso(input.deliveredAt, `orders[${index}].deliveredAt`, true),
    items: input.items.map((item, itemIndex) => parseItem(item, itemIndex)),
  };
}

export interface BusinessContextSnapshot {
  customer: Customer;
  orders: Order[];
}

export function parseBusinessContextSnapshot(value: unknown): BusinessContextSnapshot {
  const input = object(value, "body");
  const customer = parseCustomer(input.customer);
  if (!Array.isArray(input.orders) || input.orders.length > 100) throw new BusinessSyncValidationError("orders must be an array with at most 100 entries.");
  return { customer, orders: input.orders.map((order, index) => parseOrder(order, customer.id, index)) };
}

export function syncBusinessContext(db: AppDatabase, input: {
  source: string;
  eventId: string;
  rawBody: string;
  snapshot: BusinessContextSnapshot;
  tenantId?: string;
}) {
  const tenantId = resolveTenantId(db, input.tenantId);
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const existing = db.prepare("SELECT payload_hash, status FROM integration_events WHERE tenant_id = ? AND external_event_id = ?").get(tenantId, input.eventId) as
    | { payload_hash: string; status: "PROCESSED" | "REJECTED" }
    | undefined;
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw new BusinessSyncValidationError("Integration event ID was reused with a different payload.");
    return { idempotentReplay: true, customerId: input.snapshot.customer.id, ordersUpserted: input.snapshot.orders.length };
  }

  const tx = db.transaction(() => {
    const customer = input.snapshot.customer;
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      email = excluded.email,
      account_status = excluded.account_status,
      risk_level = excluded.risk_level,
      lifetime_orders = MAX(customers.lifetime_orders, excluded.lifetime_orders),
      lifetime_refunds = MAX(customers.lifetime_refunds, excluded.lifetime_refunds)`)
      .run(customer.id, tenantId, customer.name, customer.email, customer.accountStatus, customer.riskLevel, customer.lifetimeOrders, customer.lifetimeRefunds, customer.createdAt);

    for (const order of input.snapshot.orders) {
      db.prepare(`INSERT INTO orders (
        id, tenant_id, customer_id, status, currency, subtotal_cents, shipping_cents, tax_cents,
        total_paid_cents, refunded_cents, placed_at, delivered_at
      ) VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        customer_id = excluded.customer_id,
        status = excluded.status,
        subtotal_cents = excluded.subtotal_cents,
        shipping_cents = excluded.shipping_cents,
        tax_cents = excluded.tax_cents,
        total_paid_cents = excluded.total_paid_cents,
        refunded_cents = MAX(orders.refunded_cents, excluded.refunded_cents),
        placed_at = excluded.placed_at,
        delivered_at = excluded.delivered_at`)
        .run(order.id, tenantId, order.customerId, order.status, order.subtotalCents, order.shippingCents, order.taxCents, order.totalPaidCents, order.refundedCents, order.placedAt, order.deliveredAt);

      for (const item of order.items) {
        db.prepare(`INSERT INTO order_items (
          id, order_id, sku, name, quantity, unit_price_cents, final_sale, refundable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          order_id = excluded.order_id,
          sku = excluded.sku,
          name = excluded.name,
          quantity = excluded.quantity,
          unit_price_cents = excluded.unit_price_cents,
          final_sale = excluded.final_sale,
          refundable = excluded.refundable`)
          .run(item.id, order.id, item.sku, item.name, item.quantity, item.unitPriceCents, item.finalSale ? 1 : 0, item.refundable ? 1 : 0);
      }
    }

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO integration_events (
      id, tenant_id, source, external_event_id, payload_hash, status, error_code, created_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, 'PROCESSED', NULL, ?, ?)`)
      .run(`int_${randomUUID()}`, tenantId, input.source, input.eventId, payloadHash, now, now);
  });

  tx.immediate();
  return { idempotentReplay: false, customerId: input.snapshot.customer.id, ordersUpserted: input.snapshot.orders.length };
}
