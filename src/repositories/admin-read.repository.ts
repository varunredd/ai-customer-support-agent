import type { AppDatabase } from "@/db/database";
import type { AgentEventStatus, AgentRunStatus } from "@/domain/agent/types";

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
  constructor(private readonly db: AppDatabase) {}

  listRefunds(limit = 100): AdminRefundListItem[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.db
      .prepare(
        `SELECT r.id, r.run_id, r.customer_id, c.name AS customer_name, r.order_id, r.item_id,
                i.name AS item_name, r.quantity, r.amount_cents, r.currency, r.status, r.created_at
         FROM refunds r
         JOIN customers c ON c.id = r.customer_id
         JOIN order_items i ON i.id = r.item_id
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .all(safeLimit) as RefundRow[];

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
      createdAt: row.created_at,
    }));
  }

  listRunSummaries(limit = 50): AdminRunSummary[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.db
      .prepare(
        `SELECT ar.id, ar.status, ar.model, ar.customer_id, c.name AS customer_name, ar.order_id,
                ar.started_at, ar.completed_at,
                (SELECT COUNT(*) FROM agent_events e WHERE e.run_id = ar.id) AS event_count,
                (SELECT e.status FROM agent_events e WHERE e.run_id = ar.id AND e.type = 'DECISION' ORDER BY e.sequence DESC LIMIT 1) AS decision_status,
                (SELECT e.metadata_json FROM agent_events e WHERE e.run_id = ar.id AND e.type = 'DECISION' ORDER BY e.sequence DESC LIMIT 1) AS decision_metadata_json
         FROM agent_runs ar
         LEFT JOIN customers c ON c.id = ar.customer_id
         ORDER BY ar.started_at DESC
         LIMIT ?`,
      )
      .all(safeLimit) as RunSummaryRow[];

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
      };
    });
  }
}
