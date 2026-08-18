import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { ExecuteRefundInput, ExecuteRefundResult, RefundRecord } from "@/domain/refunds/execution";
import type { Customer, Order, OrderItem, RefundEvaluation, RefundRequest } from "@/domain/refunds/types";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";

interface ExistingRefundRow {
  id: string;
  idempotency_key: string;
  request_fingerprint: string;
  run_id: string | null;
  customer_id: string;
  order_id: string;
  item_id: string;
  quantity: number;
  reason: RefundRequest["reason"];
  condition: RefundRequest["condition"];
  amount_cents: number;
  currency: "USD";
  status: "COMPLETED";
  evaluation_json: string;
  created_at: string;
}

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
  currency: "USD";
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

function fingerprint(request: RefundRequest) {
  // requestedAt is application context, not money intent. Excluding it lets a retried
  // request replay safely even if transport metadata is reconstructed later.
  return createHash("sha256")
    .update(
      JSON.stringify({
        customerId: request.customerId,
        orderId: request.orderId,
        itemId: request.itemId,
        quantity: request.quantity,
        reason: request.reason,
        condition: request.condition,
      }),
    )
    .digest("hex");
}

function parseStoredEvaluation(value: string): RefundEvaluation {
  const parsed = JSON.parse(value) as Partial<RefundEvaluation>;
  if (
    (parsed.decision !== "APPROVE" && parsed.decision !== "DENY") ||
    typeof parsed.refundAmountCents !== "number" ||
    !Array.isArray(parsed.checks) ||
    !Array.isArray(parsed.denialReasons)
  ) {
    throw new Error("Persisted refund evaluation is corrupt.");
  }
  return parsed as RefundEvaluation;
}

function mapExistingRefund(row: ExistingRefundRow): RefundRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    runId: row.run_id,
    customerId: row.customer_id,
    orderId: row.order_id,
    itemId: row.item_id,
    quantity: row.quantity,
    reason: row.reason,
    condition: row.condition,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  };
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

function loadOrder(db: AppDatabase, row: OrderRow): Order {
  const itemRows = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(row.id) as ItemRow[];
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
    items: itemRows.map(mapItem),
  };
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST";

  constructor() {
    super("The idempotency key was already used for a different refund request.");
  }
}

export function executeRefundAtomically(db: AppDatabase, input: ExecuteRefundInput): ExecuteRefundResult {
  if (!input.idempotencyKey.trim()) {
    throw new Error("Idempotency key is required for refund execution.");
  }

  const requestFingerprint = fingerprint(input.request);

  const executeTransaction = db.transaction((): ExecuteRefundResult => {
    const existing = db
      .prepare("SELECT * FROM refunds WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as ExistingRefundRow | undefined;

    if (existing) {
      if (existing.request_fingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError();
      }

      // Replay the exact persisted decision. Re-evaluating here would make idempotency
      // depend on mutable state or the wall clock after money has already moved.
      return {
        status: "COMPLETED",
        idempotentReplay: true,
        refund: mapExistingRefund(existing),
        evaluation: parseStoredEvaluation(existing.evaluation_json),
      };
    }

    const customerRow = db.prepare("SELECT * FROM customers WHERE id = ?").get(input.request.customerId) as
      | CustomerRow
      | undefined;
    const orderRow = db.prepare("SELECT * FROM orders WHERE id = ?").get(input.request.orderId) as
      | OrderRow
      | undefined;

    if (!customerRow || !orderRow) {
      const fallbackCustomer: Customer = customerRow
        ? mapCustomer(customerRow)
        : {
            id: input.request.customerId,
            name: "Unknown",
            email: "unknown@example.invalid",
            accountStatus: "SUSPENDED",
            riskLevel: "HIGH",
            lifetimeOrders: 0,
            lifetimeRefunds: 0,
            createdAt: input.request.requestedAt,
          };
      const fallbackOrder: Order = orderRow
        ? loadOrder(db, orderRow)
        : {
            id: input.request.orderId,
            customerId: "unknown",
            status: "CANCELLED",
            currency: "USD",
            subtotalCents: 0,
            shippingCents: 0,
            taxCents: 0,
            totalPaidCents: 0,
            refundedCents: 0,
            placedAt: input.request.requestedAt,
            deliveredAt: null,
            items: [],
          };
      const evaluation = evaluateRefundEligibility(fallbackCustomer, fallbackOrder, input.request);
      return { status: "DENIED", idempotentReplay: false, refund: null, evaluation };
    }

    const alreadyRefunded = db
      .prepare("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM refunds WHERE item_id = ?")
      .get(input.request.itemId) as { quantity: number };

    const customer = mapCustomer(customerRow);
    const order = loadOrder(db, orderRow);
    const evaluation = evaluateRefundEligibility(customer, order, input.request, {
      alreadyRefundedItemQuantity: alreadyRefunded.quantity,
    });

    if (evaluation.decision !== "APPROVE") {
      return { status: "DENIED", idempotentReplay: false, refund: null, evaluation };
    }

    const now = new Date().toISOString();
    const refundId = `ref_${randomUUID()}`;
    db.prepare(`
      INSERT INTO refunds (
        id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
        quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'COMPLETED', ?, ?)
    `).run(
      refundId,
      input.idempotencyKey,
      requestFingerprint,
      input.runId ?? null,
      input.request.customerId,
      input.request.orderId,
      input.request.itemId,
      input.request.quantity,
      input.request.reason,
      input.request.condition,
      evaluation.refundAmountCents,
      JSON.stringify(evaluation),
      now,
    );

    db.prepare("UPDATE orders SET refunded_cents = refunded_cents + ? WHERE id = ?").run(
      evaluation.refundAmountCents,
      input.request.orderId,
    );
    db.prepare("UPDATE customers SET lifetime_refunds = lifetime_refunds + 1 WHERE id = ?").run(
      input.request.customerId,
    );

    const row = db.prepare("SELECT * FROM refunds WHERE id = ?").get(refundId) as ExistingRefundRow;
    return {
      status: "COMPLETED",
      idempotentReplay: false,
      refund: mapExistingRefund(row),
      evaluation,
    };
  });

  return executeTransaction.immediate();
}
