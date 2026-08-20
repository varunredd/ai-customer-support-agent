import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export type EscalationPriority = "NORMAL" | "HIGH";
export type EscalationStatus = "OPEN" | "RESOLVED";

export interface SupportEscalation {
  id: string;
  runId: string;
  customerId: string;
  orderId: string | null;
  reasonCode: string;
  summary: string;
  priority: EscalationPriority;
  status: EscalationStatus;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  run_id: string;
  customer_id: string;
  order_id: string | null;
  reason_code: string;
  summary: string;
  priority: EscalationPriority;
  status: EscalationStatus;
  created_at: string;
  updated_at: string;
}

function map(row: Row): SupportEscalation {
  return {
    id: row.id,
    runId: row.run_id,
    customerId: row.customer_id,
    orderId: row.order_id,
    reasonCode: row.reason_code,
    summary: row.summary,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupportEscalationRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  createOrGet(input: {
    runId: string;
    customerId: string;
    orderId?: string | null;
    reasonCode: string;
    summary: string;
    priority: EscalationPriority;
  }): SupportEscalation {
    const existing = this.findByRunId(input.runId);
    if (existing) return existing;
    const id = `esc_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO support_escalations (
      id, tenant_id, run_id, customer_id, order_id, reason_code, summary, priority, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`)
      .run(id, this.tenantId, input.runId, input.customerId, input.orderId ?? null, input.reasonCode, input.summary.slice(0, 1000), input.priority, now, now);
    return this.findByRunId(input.runId)!;
  }

  findByRunId(runId: string): SupportEscalation | null {
    const row = this.db.prepare("SELECT * FROM support_escalations WHERE tenant_id = ? AND run_id = ?").get(this.tenantId, runId) as Row | undefined;
    return row ? map(row) : null;
  }

  listRecent(limit = 100): SupportEscalation[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return (this.db.prepare("SELECT * FROM support_escalations WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").all(this.tenantId, safeLimit) as Row[]).map(map);
  }
}
