import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { RefundEvaluation, RefundRequest } from "@/domain/refunds/types";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export type RefundApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RefundApprovalRequest {
  id: string;
  tenantId: string;
  runId: string | null;
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  reason: RefundRequest["reason"];
  condition: RefundRequest["condition"];
  amountCents: number;
  currency: "USD";
  policyVersion: string | null;
  evaluation: RefundEvaluation;
  idempotencyKey: string;
  requestFingerprint: string;
  status: RefundApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
}

interface Row {
  id: string;
  tenant_id: string;
  run_id: string | null;
  customer_id: string;
  order_id: string;
  item_id: string;
  quantity: number;
  reason: RefundRequest["reason"];
  condition: RefundRequest["condition"];
  amount_cents: number;
  currency: "USD";
  policy_version: string | null;
  evaluation_json: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: RefundApprovalStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
  decision_note: string | null;
}

function map(row: Row): RefundApprovalRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: row.run_id,
    customerId: row.customer_id,
    orderId: row.order_id,
    itemId: row.item_id,
    quantity: row.quantity,
    reason: row.reason,
    condition: row.condition,
    amountCents: row.amount_cents,
    currency: row.currency,
    policyVersion: row.policy_version,
    evaluation: JSON.parse(row.evaluation_json) as RefundEvaluation,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedByUserId: row.decided_by_user_id,
    decisionNote: row.decision_note,
  };
}

export class RefundApprovalRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  findById(id: string): RefundApprovalRequest | null {
    const row = this.db.prepare("SELECT * FROM refund_approval_requests WHERE tenant_id = ? AND id = ?")
      .get(this.tenantId, id) as Row | undefined;
    return row ? map(row) : null;
  }

  findByIdempotencyKey(key: string): RefundApprovalRequest | null {
    const row = this.db.prepare("SELECT * FROM refund_approval_requests WHERE tenant_id = ? AND idempotency_key = ?")
      .get(this.tenantId, key) as Row | undefined;
    return row ? map(row) : null;
  }

  findLatestPendingForOrder(customerId: string, orderId: string): RefundApprovalRequest | null {
    const row = this.db.prepare(`
      SELECT * FROM refund_approval_requests
      WHERE tenant_id = ? AND customer_id = ? AND order_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.tenantId, customerId, orderId) as Row | undefined;
    return row ? map(row) : null;
  }

  listPending(limit = 100): RefundApprovalRequest[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return (this.db.prepare(`
      SELECT * FROM refund_approval_requests
      WHERE tenant_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as Row[]).map(map);
  }

  createPending(input: {
    runId?: string | null;
    request: RefundRequest;
    amountCents: number;
    policyVersion: string | null;
    evaluation: RefundEvaluation;
    idempotencyKey: string;
    requestFingerprint: string;
  }): RefundApprovalRequest {
    const existing = this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const id = `apr_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO refund_approval_requests (
        id, tenant_id, run_id, customer_id, order_id, item_id, quantity, reason, condition,
        amount_cents, currency, policy_version, evaluation_json, idempotency_key, request_fingerprint,
        status, created_at, decided_at, decided_by_user_id, decision_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'PENDING', ?, NULL, NULL, NULL)
    `).run(
      id,
      this.tenantId,
      input.runId ?? null,
      input.request.customerId,
      input.request.orderId,
      input.request.itemId,
      input.request.quantity,
      input.request.reason,
      input.request.condition,
      input.amountCents,
      input.policyVersion,
      JSON.stringify(input.evaluation),
      input.idempotencyKey,
      input.requestFingerprint,
      now,
    );
    return this.findById(id)!;
  }

  markDecided(id: string, input: {
    status: "APPROVED" | "REJECTED";
    decidedByUserId: string;
    decisionNote?: string | null;
  }): RefundApprovalRequest {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE refund_approval_requests
      SET status = ?, decided_at = ?, decided_by_user_id = ?, decision_note = ?
      WHERE tenant_id = ? AND id = ? AND status = 'PENDING'
    `).run(
      input.status,
      now,
      input.decidedByUserId,
      input.decisionNote?.slice(0, 1000) ?? null,
      this.tenantId,
      id,
    );
    const updated = this.findById(id);
    if (!updated || updated.status === "PENDING") {
      throw new Error("Approval request was not pending or was not found.");
    }
    return updated;
  }
}
