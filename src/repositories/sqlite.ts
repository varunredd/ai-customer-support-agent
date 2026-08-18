import type { AppDatabase } from "@/db/database";
import type { Customer, Order, OrderItem } from "@/domain/refunds/types";
import type { CustomerRepository, OrderRepository } from "@/repositories/contracts";

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  account_status: Customer["accountStatus"];
  risk_level: Customer["riskLevel"];
  lifetime_orders: number;
  lifetime_refunds: number;
  created_at: string;
}

interface OrderRow {
  id: string;
  customer_id: string;
  status: Order["status"];
  currency: Order["currency"];
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_paid_cents: number;
  refunded_cents: number;
  placed_at: string;
  delivered_at: string | null;
}

interface ItemRow {
  id: string;
  order_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  final_sale: number;
  refundable: number;
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    accountStatus: row.account_status,
    riskLevel: row.risk_level,
    lifetimeOrders: row.lifetime_orders,
    lifetimeRefunds: row.lifetime_refunds,
    createdAt: row.created_at,
  };
}

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    finalSale: row.final_sale === 1,
    refundable: row.refundable === 1,
  };
}

function mapOrder(db: AppDatabase, row: OrderRow): Order {
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(row.id) as ItemRow[];

  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    totalPaidCents: row.total_paid_cents,
    refundedCents: row.refunded_cents,
    placedAt: row.placed_at,
    deliveredAt: row.delivered_at,
    items: items.map(mapItem),
  };
}

export function createSqliteCustomerRepository(db: AppDatabase): CustomerRepository {
  return {
    async findById(id) {
      const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
      return row ? mapCustomer(row) : null;
    },
    async findByEmail(email) {
      const row = db.prepare("SELECT * FROM customers WHERE email = ? COLLATE NOCASE").get(email) as
        | CustomerRow
        | undefined;
      return row ? mapCustomer(row) : null;
    },
    async listAll() {
      const rows = db.prepare("SELECT * FROM customers ORDER BY name").all() as CustomerRow[];
      return rows.map(mapCustomer);
    },
  };
}

export function createSqliteOrderRepository(db: AppDatabase): OrderRepository {
  return {
    async findById(id) {
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
      return row ? mapOrder(db, row) : null;
    },
    async findForCustomer(orderId, customerId) {
      const row = db
        .prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?")
        .get(orderId, customerId) as OrderRow | undefined;
      return row ? mapOrder(db, row) : null;
    },
    async listForCustomer(customerId) {
      const rows = db
        .prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY placed_at DESC")
        .all(customerId) as OrderRow[];
      return rows.map((row) => mapOrder(db, row));
    },
  };
}
