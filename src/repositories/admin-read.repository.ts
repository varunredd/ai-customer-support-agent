import type { AppDatabase } from "@/db/database";
import type { AgentEventStatus, AgentRunStatus } from "@/domain/agent/types";
import { getPublicIntegrationStatus, type PublicIntegrationStatus } from "@/services/integrations/tenant-integration.service";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export interface AdminRefundListItem {
  id: string;
  runId: string | null;
  customerId: string;
  customerName: string;
  orderId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  amountCents: number;
  currency: "USD";
  status: "COMPLETED";
  policyVersion: string | null;
  createdAt: string;
}

export interface AdminRunSummary {
  id: string;
  status: AgentRunStatus;
  model: string;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  startedAt: string;
  completedAt: string | null;
  eventCount: number;
  decision: "APPROVE" | "DENY" | null;
  decisionStatus: AgentEventStatus | null;
  refundAmountCents: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
}

interface RefundRow {
  id: string;
  run_id: string | null;
  customer_id: string;
  customer_name: string;
  order_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  amount_cents: number;
  currency: "USD";
  status: "COMPLETED";
  policy_version: string | null;
  created_at: string;
}

interface RunSummaryRow {
  id: string;
  status: AgentRunStatus;
  model: string;
  customer_id: string | null;
  customer_name: string | null;
  order_id: string | null;
  started_at: string;
  completed_at: string | null;
  event_count: number;
  decision_status: AgentEventStatus | null;
  decision_metadata_json: string | null;
  error_code: string | null;
  error_message: string | null;
}

function durationMs(startedAt: string, completedAt: string | null) {
  if (!completedAt) return null;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null;
  return completed - started;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index] ?? 0);
}

function parseDecision(value: string | null): { decision: "APPROVE" | "DENY" | null; refundAmountCents: number | null } {
  if (!value) return { decision: null, refundAmountCents: null };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { decision: null, refundAmountCents: null };
    const record = parsed as Record<string, unknown>;
    const decision = record.decision === "APPROVE" || record.decision === "DENY" ? record.decision : null;
    const refundAmountCents = typeof record.refundAmountCents === "number" ? record.refundAmountCents : null;
    return { decision, refundAmountCents };
  } catch {
    return { decision: null, refundAmountCents: null };
  }
}

export class AdminReadRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  listRefunds(limit = 100): AdminRefundListItem[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.db
      .prepare(
        `SELECT r.id, r.run_id, r.customer_id, c.name AS customer_name, r.order_id, r.item_id,
                i.name AS item_name, r.quantity, r.amount_cents, r.currency, r.status, r.policy_version, r.created_at
         FROM refunds r
         JOIN customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
         JOIN order_items i ON i.id = r.item_id
         WHERE r.tenant_id = ?
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .all(this.tenantId, safeLimit) as RefundRow[];

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      orderId: row.order_id,
      itemId: row.item_id,
      itemName: row.item_name,
      quantity: row.quantity,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      policyVersion: row.policy_version,
      createdAt: row.created_at,
    }));
  }

  listRunSummaries(limit = 50, options: { status?: AgentRunStatus } = {}): AdminRunSummary[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.db
      .prepare(
        `SELECT ar.id, ar.status, ar.model, ar.customer_id, c.name AS customer_name, ar.order_id,
                ar.started_at, ar.completed_at, ar.error_code, ar.error_message,
                (SELECT COUNT(*) FROM agent_events e WHERE e.run_id = ar.id) AS event_count,
                (SELECT e.status FROM agent_events e WHERE e.run_id = ar.id AND e.type = 'DECISION' ORDER BY e.sequence DESC LIMIT 1) AS decision_status,
                (SELECT e.metadata_json FROM agent_events e WHERE e.run_id = ar.id AND e.type = 'DECISION' ORDER BY e.sequence DESC LIMIT 1) AS decision_metadata_json
         FROM agent_runs ar
         LEFT JOIN customers c ON c.id = ar.customer_id AND c.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = ? ${options.status ? "AND ar.status = ?" : ""}
         ORDER BY ar.started_at DESC
         LIMIT ?`,
      )
      .all(...(options.status ? [this.tenantId, options.status, safeLimit] : [this.tenantId, safeLimit])) as RunSummaryRow[];

    return rows.map((row) => {
      const decision = parseDecision(row.decision_metadata_json);
      return {
        id: row.id,
        status: row.status,
        model: row.model,
        customerId: row.customer_id,
        customerName: row.customer_name,
        orderId: row.order_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        eventCount: row.event_count,
        decision: decision.decision,
        decisionStatus: row.decision_status,
        refundAmountCents: decision.refundAmountCents,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        durationMs: durationMs(row.started_at, row.completed_at),
      };
    });
  }

  listDecisions(limit = 80): AdminDecisionItem[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.db.prepare(`
      SELECT
        ar.id AS run_id,
        ar.status AS run_status,
        ar.customer_id,
        c.name AS customer_name,
        ar.order_id,
        ar.started_at,
        ar.completed_at,
        e.status AS decision_status,
        e.metadata_json AS decision_metadata_json,
        r.id AS refund_id,
        r.amount_cents AS refund_amount_cents,
        r.policy_version AS refund_policy_version,
        a.id AS approval_id,
        a.status AS approval_status,
        a.amount_cents AS approval_amount_cents,
        a.policy_version AS approval_policy_version,
        esc.id AS escalation_id,
        esc.status AS escalation_status
      FROM agent_runs ar
      LEFT JOIN customers c ON c.id = ar.customer_id AND c.tenant_id = ar.tenant_id
      LEFT JOIN agent_events e ON e.id = (
        SELECT e2.id FROM agent_events e2
        WHERE e2.run_id = ar.id AND e2.type = 'DECISION'
        ORDER BY e2.sequence DESC LIMIT 1
      )
      LEFT JOIN refunds r ON r.id = (
        SELECT r2.id FROM refunds r2
        WHERE r2.run_id = ar.id AND r2.tenant_id = ar.tenant_id
        ORDER BY r2.created_at DESC LIMIT 1
      )
      LEFT JOIN refund_approval_requests a ON a.id = (
        SELECT a2.id FROM refund_approval_requests a2
        WHERE a2.run_id = ar.id AND a2.tenant_id = ar.tenant_id
        ORDER BY a2.created_at DESC LIMIT 1
      )
      LEFT JOIN support_escalations esc ON esc.run_id = ar.id AND esc.tenant_id = ar.tenant_id
      WHERE ar.tenant_id = ?
        AND (e.id IS NOT NULL OR r.id IS NOT NULL OR a.id IS NOT NULL OR esc.id IS NOT NULL)
      ORDER BY ar.started_at DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as DecisionRow[];

    return rows.map((row) => {
      const parsed = parseDecision(row.decision_metadata_json);
      const outcome = deriveDecisionOutcome(row, parsed.decision);
      return {
        runId: row.run_id,
        runStatus: row.run_status,
        customerId: row.customer_id,
        customerName: row.customer_name,
        orderId: row.order_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        outcome,
        policyVersion: row.refund_policy_version ?? row.approval_policy_version,
        refundId: row.refund_id,
        refundAmountCents: row.refund_amount_cents ?? parsed.refundAmountCents ?? row.approval_amount_cents,
        approvalId: row.approval_id,
        approvalStatus: row.approval_status,
        escalationId: row.escalation_id,
        escalationStatus: row.escalation_status,
      };
    });
  }

  getAnalyticsSnapshot(): AdminAnalyticsSnapshot {
    const count = (sql: string, ...params: unknown[]) =>
      (this.db.prepare(sql).get(...params) as { count: number }).count;

    const runsTotal = count("SELECT COUNT(*) AS count FROM agent_runs WHERE tenant_id = ?", this.tenantId);
    const runsCompleted = count("SELECT COUNT(*) AS count FROM agent_runs WHERE tenant_id = ? AND status = 'COMPLETED'", this.tenantId);
    const runsFailed = count("SELECT COUNT(*) AS count FROM agent_runs WHERE tenant_id = ? AND status = 'FAILED'", this.tenantId);
    const policyApprovals = count(`
      SELECT COUNT(*) AS count FROM agent_events e
      JOIN agent_runs ar ON ar.id = e.run_id
      WHERE ar.tenant_id = ? AND e.type = 'DECISION' AND json_extract(e.metadata_json, '$.decision') = 'APPROVE'
    `, this.tenantId);
    const policyDenials = count(`
      SELECT COUNT(*) AS count FROM agent_events e
      JOIN agent_runs ar ON ar.id = e.run_id
      WHERE ar.tenant_id = ? AND e.type = 'DECISION' AND json_extract(e.metadata_json, '$.decision') = 'DENY'
    `, this.tenantId);
    const refunds = this.db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS cents
      FROM refunds WHERE tenant_id = ?
    `).get(this.tenantId) as { count: number; cents: number };
    const pendingApprovals = count("SELECT COUNT(*) AS count FROM refund_approval_requests WHERE tenant_id = ? AND status = 'PENDING'", this.tenantId);
    const managerApproved = count("SELECT COUNT(*) AS count FROM refund_approval_requests WHERE tenant_id = ? AND status = 'APPROVED'", this.tenantId);
    const openEscalations = count("SELECT COUNT(*) AS count FROM support_escalations WHERE tenant_id = ? AND status = 'OPEN'", this.tenantId);
    const conversations = count("SELECT COUNT(*) AS count FROM support_sessions WHERE tenant_id = ?", this.tenantId);
    const escalationsTotal = count("SELECT COUNT(*) AS count FROM support_escalations WHERE tenant_id = ?", this.tenantId);
    const automatedRefunds = Math.max(0, refunds.count - managerApproved);
    const decidedOutcomes = automatedRefunds + managerApproved + pendingApprovals + policyDenials;
    const automationRate = decidedOutcomes > 0 ? automatedRefunds / decidedOutcomes : 0;
    const escalationRate = runsCompleted + runsFailed > 0 ? escalationsTotal / (runsCompleted + runsFailed) : 0;
    const latencies = (this.db.prepare(`
      SELECT started_at, completed_at FROM agent_runs
      WHERE tenant_id = ? AND completed_at IS NOT NULL
    `).all(this.tenantId) as Array<{ started_at: string; completed_at: string }>).
      map((row) => durationMs(row.started_at, row.completed_at)).
      filter((value): value is number => value != null);
    const webhookCounts = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END), 0) AS dead,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending
      FROM outbound_webhook_deliveries WHERE tenant_id = ?
    `).get(this.tenantId) as { dead: number; pending: number };
    const notificationCounts = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END), 0) AS dead,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending
      FROM notification_outbox WHERE tenant_id = ?
    `).get(this.tenantId) as { dead: number; pending: number };
    const modelRequests = count(`
      SELECT COUNT(*) AS count FROM agent_events e
      JOIN agent_runs ar ON ar.id = e.run_id
      WHERE ar.tenant_id = ? AND e.type = 'MODEL_REQUEST'
    `, this.tenantId);

    return {
      runsTotal,
      runsCompleted,
      runsFailed,
      policyApprovals,
      policyDenials,
      refundCount: refunds.count,
      refundedCents: refunds.cents,
      pendingApprovals,
      managerApproved,
      openEscalations,
      conversations,
      automationRate,
      escalationRate,
      p95LatencyMs: percentile(latencies, 95),
      modelRequests,
      openaiCostUsd: null,
      webhookDead: webhookCounts.dead,
      webhookPending: webhookCounts.pending,
      notificationDead: notificationCounts.dead,
      notificationPending: notificationCounts.pending,
    };
  }

  getIntegrationStatus(): AdminIntegrationStatus {
    return getPublicIntegrationStatus(this.db, this.tenantId);
  }
}

export type AdminDecisionOutcome =
  | "AUTO_APPROVED"
  | "MANUALLY_APPROVED"
  | "DENIED_BY_POLICY"
  | "DENIED_BY_MANAGER"
  | "REQUIRES_APPROVAL"
  | "ESCALATED_TO_HUMAN";

export interface AdminDecisionItem {
  runId: string;
  runStatus: AgentRunStatus;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  startedAt: string;
  completedAt: string | null;
  outcome: AdminDecisionOutcome;
  policyVersion: string | null;
  refundId: string | null;
  refundAmountCents: number | null;
  approvalId: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  escalationId: string | null;
  escalationStatus: "OPEN" | "RESOLVED" | null;
}

export interface AdminAnalyticsSnapshot {
  runsTotal: number;
  runsCompleted: number;
  runsFailed: number;
  policyApprovals: number;
  policyDenials: number;
  refundCount: number;
  refundedCents: number;
  pendingApprovals: number;
  managerApproved: number;
  openEscalations: number;
  conversations: number;
  automationRate: number;
  escalationRate: number;
  p95LatencyMs: number | null;
  modelRequests: number;
  openaiCostUsd: number | null;
  webhookDead: number;
  webhookPending: number;
  notificationDead: number;
  notificationPending: number;
}

export type AdminIntegrationStatus = PublicIntegrationStatus;

interface DecisionRow {
  run_id: string;
  run_status: AgentRunStatus;
  customer_id: string | null;
  customer_name: string | null;
  order_id: string | null;
  started_at: string;
  completed_at: string | null;
  decision_status: AgentEventStatus | null;
  decision_metadata_json: string | null;
  refund_id: string | null;
  refund_amount_cents: number | null;
  refund_policy_version: string | null;
  approval_id: string | null;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | null;
  approval_amount_cents: number | null;
  approval_policy_version: string | null;
  escalation_id: string | null;
  escalation_status: "OPEN" | "RESOLVED" | null;
}

function deriveDecisionOutcome(
  row: DecisionRow,
  decision: "APPROVE" | "DENY" | null,
): AdminDecisionOutcome {
  if (row.approval_status === "PENDING") return "REQUIRES_APPROVAL";
  if (row.approval_status === "REJECTED") return "DENIED_BY_MANAGER";
  if (row.approval_status === "APPROVED" && row.refund_id) return "MANUALLY_APPROVED";
  if (row.refund_id) return "AUTO_APPROVED";
  if (decision === "DENY") return "DENIED_BY_POLICY";
  if (row.escalation_id) return "ESCALATED_TO_HUMAN";
  if (decision === "APPROVE") return "AUTO_APPROVED";
  return "ESCALATED_TO_HUMAN";
}
