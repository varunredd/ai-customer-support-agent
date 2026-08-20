import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { ExecuteRefundInput, ExecuteRefundResult, RefundRecord } from "@/domain/refunds/execution";
import type { Customer, Order, OrderItem, RefundEvaluation, RefundRequest } from "@/domain/refunds/types";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";
import { RefundApprovalRepository } from "@/repositories/refund-approval.repository";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";
import { resolveAutoApproveMaxCents } from "@/services/refund-approval-threshold.service";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";
import { emitOutboundWebhook } from "@/services/integrations/outbound-webhook.service";

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
  policy_version: string | null;
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
    policyVersion: row.policy_version,
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

export function executeRefundAtomically(db: AppDatabase, input: ExecuteRefundInput, tenantId?: string): ExecuteRefundResult {
  if (!input.idempotencyKey.trim()) {
    throw new Error("Idempotency key is required for refund execution.");
  }

  const tenant = resolveTenantId(db, tenantId);
  const requestFingerprint = fingerprint(input.request);

  const executeTransaction = db.transaction((): ExecuteRefundResult => {
    const existing = db
      .prepare("SELECT * FROM refunds WHERE tenant_id = ? AND idempotency_key = ?")
      .get(tenant, input.idempotencyKey) as ExistingRefundRow | undefined;

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

    const pendingApproval = new RefundApprovalRepository(db, tenant).findByIdempotencyKey(input.idempotencyKey);
    if (pendingApproval) {
      if (pendingApproval.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError();
      }
      if (pendingApproval.status === "PENDING") {
        return {
          status: "PENDING_APPROVAL",
          idempotentReplay: true,
          refund: null,
          evaluation: pendingApproval.evaluation,
          approvalId: pendingApproval.id,
          autoApproveMaxCents: resolveAutoApproveMaxCents(db, tenant),
        };
      }
      if (pendingApproval.status === "REJECTED") {
        return {
          status: "DENIED",
          idempotentReplay: false,
          refund: null,
          evaluation: pendingApproval.evaluation,
        };
      }
    }

    const customerRow = db.prepare("SELECT * FROM customers WHERE tenant_id = ? AND id = ?").get(tenant, input.request.customerId) as
      | CustomerRow
      | undefined;
    const orderRow = db.prepare("SELECT * FROM orders WHERE tenant_id = ? AND id = ?").get(tenant, input.request.orderId) as
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
      const evaluation = evaluateRefundEligibility(fallbackCustomer, fallbackOrder, input.request, {
        policy: new RefundPolicyRepository(db, tenant).getActive(),
      });
      return { status: "DENIED", idempotentReplay: false, refund: null, evaluation };
    }

    const alreadyRefunded = db
      .prepare("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM refunds WHERE tenant_id = ? AND item_id = ?")
      .get(tenant, input.request.itemId) as { quantity: number };

    const customer = mapCustomer(customerRow);
    const order = loadOrder(db, orderRow);
    const policy = new RefundPolicyRepository(db, tenant).getActive();
    const evaluation = evaluateRefundEligibility(customer, order, input.request, {
      alreadyRefundedItemQuantity: alreadyRefunded.quantity,
      policy,
    });

    if (evaluation.decision !== "APPROVE") {
      return { status: "DENIED", idempotentReplay: false, refund: null, evaluation };
    }

    const autoApproveMaxCents = resolveAutoApproveMaxCents(db, tenant);
    if (evaluation.refundAmountCents > autoApproveMaxCents) {
      const approval = new RefundApprovalRepository(db, tenant).createPending({
        runId: input.runId,
        request: input.request,
        amountCents: evaluation.refundAmountCents,
        policyVersion: policy.version,
        evaluation,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
      });
      return {
        status: "PENDING_APPROVAL",
        idempotentReplay: false,
        refund: null,
        evaluation,
        approvalId: approval.id,
        autoApproveMaxCents,
      };
    }

    const now = new Date().toISOString();
    const refundId = `ref_${randomUUID()}`;
    db.prepare(`
      INSERT INTO refunds (
        id, tenant_id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
        quantity, reason, condition, amount_cents, currency, status, policy_version, evaluation_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'COMPLETED', ?, ?, ?)
    `).run(
      refundId,
      tenant,
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
      policy.version,
      JSON.stringify(evaluation),
      now,
    );

    db.prepare("UPDATE orders SET refunded_cents = refunded_cents + ? WHERE tenant_id = ? AND id = ?").run(
      evaluation.refundAmountCents,
      tenant,
      input.request.orderId,
    );
    db.prepare("UPDATE customers SET lifetime_refunds = lifetime_refunds + 1 WHERE tenant_id = ? AND id = ?").run(
      tenant,
      input.request.customerId,
    );

    new NotificationOutboxRepository(db, tenant).enqueue({
      eventKey: `refund-completed:${refundId}`,
      eventType: "REFUND_COMPLETED",
      recipient: customer.email,
      subject: `Refund confirmed for order ${input.request.orderId}`,
      payload: {
        refundId,
        orderId: input.request.orderId,
        amountCents: evaluation.refundAmountCents,
        currency: "USD",
        policyVersion: policy.version,
      },
    });

    const row = db.prepare("SELECT * FROM refunds WHERE tenant_id = ? AND id = ?").get(tenant, refundId) as ExistingRefundRow;
    return {
      status: "COMPLETED",
      idempotentReplay: false,
      refund: mapExistingRefund(row),
      evaluation,
    };
  });

  const result = executeTransaction.immediate();
  if (result.status === "PENDING_APPROVAL" && result.approvalId) {
    emitOutboundWebhook(db, {
      eventType: "approval.required",
      eventKey: `approval.required:${result.approvalId}`,
      tenantId: tenant,
      payload: {
        approvalId: result.approvalId,
        customerId: input.request.customerId,
        orderId: input.request.orderId,
        amountCents: result.evaluation.refundAmountCents,
      },
    });
  }
  if (result.status === "COMPLETED" && !result.idempotentReplay && result.refund) {
    emitOutboundWebhook(db, {
      eventType: "refund.completed",
      eventKey: `refund.completed:${result.refund.id}`,
      tenantId: tenant,
      payload: {
        refundId: result.refund.id,
        customerId: result.refund.customerId,
        orderId: result.refund.orderId,
        amountCents: result.refund.amountCents,
      },
    });
    void import("@/services/integrations/ecommerce-refund-notify.service").then(({ notifyEcommerceRefundCompleted }) =>
      notifyEcommerceRefundCompleted({
        refundId: result.refund!.id,
        customerId: result.refund!.customerId,
        orderId: result.refund!.orderId,
        itemId: result.refund!.itemId,
        quantity: result.refund!.quantity,
        amountCents: result.refund!.amountCents,
        reason: result.refund!.reason,
        condition: result.refund!.condition,
        tenantId: tenant,
      }),
    );
  }
  return result;
}

export function rejectRefundApproval(
  db: AppDatabase,
  approvalId: string,
  actorUserId: string,
  note?: string,
  tenantId?: string,
) {
  const tenant = resolveTenantId(db, tenantId);
  const repo = new RefundApprovalRepository(db, tenant);
  const current = repo.findById(approvalId);
  if (!current) throw new Error("Approval request was not found.");
  if (current.status !== "PENDING") throw new Error("Only pending approvals can be rejected.");
  return repo.markDecided(approvalId, {
    status: "REJECTED",
    decidedByUserId: actorUserId,
    decisionNote: note,
  });
}

/** Manager override: re-check policy, write ledger, mark approval APPROVED. */
export function approveRefundApproval(
  db: AppDatabase,
  approvalId: string,
  actorUserId: string,
  note?: string,
  tenantId?: string,
): ExecuteRefundResult {
  const tenant = resolveTenantId(db, tenantId);
  const repo = new RefundApprovalRepository(db, tenant);
  const current = repo.findById(approvalId);
  if (!current) throw new Error("Approval request was not found.");
  if (current.status !== "PENDING") throw new Error("Only pending approvals can be approved.");

  const result = executeRefundAtomically(db, {
    idempotencyKey: current.idempotencyKey,
    runId: current.runId ?? undefined,
    request: {
      customerId: current.customerId,
      orderId: current.orderId,
      itemId: current.itemId,
      quantity: current.quantity,
      reason: current.reason,
      condition: current.condition,
      requestedAt: new Date().toISOString(),
    },
  }, tenant);

  // Manual path: if still gated by threshold, force-complete inside a transaction.
  if (result.status === "PENDING_APPROVAL") {
    const forced = db.transaction((): ExecuteRefundResult => {
      const existing = db
        .prepare("SELECT * FROM refunds WHERE tenant_id = ? AND idempotency_key = ?")
        .get(tenant, current.idempotencyKey) as ExistingRefundRow | undefined;
      if (existing) {
        repo.markDecided(approvalId, { status: "APPROVED", decidedByUserId: actorUserId, decisionNote: note });
        return {
          status: "COMPLETED",
          idempotentReplay: true,
          refund: mapExistingRefund(existing),
          evaluation: parseStoredEvaluation(existing.evaluation_json),
        };
      }

      const customerRow = db.prepare("SELECT * FROM customers WHERE tenant_id = ? AND id = ?").get(tenant, current.customerId) as CustomerRow | undefined;
      const orderRow = db.prepare("SELECT * FROM orders WHERE tenant_id = ? AND id = ?").get(tenant, current.orderId) as OrderRow | undefined;
      if (!customerRow || !orderRow) {
        throw new Error("Customer or order for this approval no longer exists.");
      }
      const alreadyRefunded = db
        .prepare("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM refunds WHERE tenant_id = ? AND item_id = ?")
        .get(tenant, current.itemId) as { quantity: number };
      const customer = mapCustomer(customerRow);
      const order = loadOrder(db, orderRow);
      const policy = new RefundPolicyRepository(db, tenant).getActive();
      const request: RefundRequest = {
        customerId: current.customerId,
        orderId: current.orderId,
        itemId: current.itemId,
        quantity: current.quantity,
        reason: current.reason,
        condition: current.condition,
        requestedAt: new Date().toISOString(),
      };
      const evaluation = evaluateRefundEligibility(customer, order, request, {
        alreadyRefundedItemQuantity: alreadyRefunded.quantity,
        policy,
      });
      if (evaluation.decision !== "APPROVE") {
        return { status: "DENIED", idempotentReplay: false, refund: null, evaluation };
      }

      const now = new Date().toISOString();
      const refundId = `ref_${randomUUID()}`;
      const runIdExists = current.runId
        ? Boolean(db.prepare("SELECT 1 AS ok FROM agent_runs WHERE id = ?").get(current.runId))
        : false;
      db.prepare(`
        INSERT INTO refunds (
          id, tenant_id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
          quantity, reason, condition, amount_cents, currency, status, policy_version, evaluation_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'COMPLETED', ?, ?, ?)
      `).run(
        refundId,
        tenant,
        current.idempotencyKey,
        current.requestFingerprint,
        runIdExists ? current.runId : null,
        current.customerId,
        current.orderId,
        current.itemId,
        current.quantity,
        current.reason,
        current.condition,
        evaluation.refundAmountCents,
        policy.version,
        JSON.stringify(evaluation),
        now,
      );
      db.prepare("UPDATE orders SET refunded_cents = refunded_cents + ? WHERE tenant_id = ? AND id = ?")
        .run(evaluation.refundAmountCents, tenant, current.orderId);
      db.prepare("UPDATE customers SET lifetime_refunds = lifetime_refunds + 1 WHERE tenant_id = ? AND id = ?")
        .run(tenant, current.customerId);
      new NotificationOutboxRepository(db, tenant).enqueue({
        eventKey: `refund-completed:${refundId}`,
        eventType: "REFUND_COMPLETED",
        recipient: customer.email,
        subject: `Refund confirmed for order ${current.orderId}`,
        payload: {
          refundId,
          orderId: current.orderId,
          amountCents: evaluation.refundAmountCents,
          currency: "USD",
          policyVersion: policy.version,
          manuallyApproved: true,
        },
      });
      repo.markDecided(approvalId, { status: "APPROVED", decidedByUserId: actorUserId, decisionNote: note });
      const row = db.prepare("SELECT * FROM refunds WHERE tenant_id = ? AND id = ?").get(tenant, refundId) as ExistingRefundRow;
      return {
        status: "COMPLETED",
        idempotentReplay: false,
        refund: mapExistingRefund(row),
        evaluation,
      };
    });
    const completed = forced.immediate();
    if (completed.status === "COMPLETED" && !completed.idempotentReplay && completed.refund) {
      emitOutboundWebhook(db, {
        eventType: "refund.completed",
        eventKey: `refund.completed:${completed.refund.id}`,
        tenantId: tenant,
        payload: {
          refundId: completed.refund.id,
          customerId: completed.refund.customerId,
          orderId: completed.refund.orderId,
          amountCents: completed.refund.amountCents,
        },
      });
      void import("@/services/integrations/ecommerce-refund-notify.service").then(({ notifyEcommerceRefundCompleted }) =>
        notifyEcommerceRefundCompleted({
          refundId: completed.refund!.id,
          customerId: completed.refund!.customerId,
          orderId: completed.refund!.orderId,
          itemId: completed.refund!.itemId,
          quantity: completed.refund!.quantity,
          amountCents: completed.refund!.amountCents,
          reason: completed.refund!.reason,
          condition: completed.refund!.condition,
          tenantId: tenant,
        }),
      );
    }
    return completed;
  }

  if (result.status === "COMPLETED") {
    repo.markDecided(approvalId, { status: "APPROVED", decidedByUserId: actorUserId, decisionNote: note });
  }
  return result;
}
