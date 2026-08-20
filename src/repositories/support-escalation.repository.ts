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
  assignedUserId: string | null;
  notes: string | null;
  resolvedByUserId: string | null;
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
  assigned_user_id: string | null;
  notes: string | null;
  resolved_by_user_id: string | null;
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
    assignedUserId: row.assigned_user_id,
    notes: row.notes,
    resolvedByUserId: row.resolved_by_user_id,
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

  findById(id: string): SupportEscalation | null {
    const row = this.db.prepare("SELECT * FROM support_escalations WHERE tenant_id = ? AND id = ?").get(this.tenantId, id) as Row | undefined;
    return row ? map(row) : null;
  }

  findByRunId(runId: string): SupportEscalation | null {
    const row = this.db.prepare("SELECT * FROM support_escalations WHERE tenant_id = ? AND run_id = ?").get(this.tenantId, runId) as Row | undefined;
    return row ? map(row) : null;
  }

  findLatestForOrder(customerId: string, orderId: string): SupportEscalation | null {
    const row = this.db.prepare(`
      SELECT * FROM support_escalations
      WHERE tenant_id = ? AND customer_id = ? AND order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.tenantId, customerId, orderId) as Row | undefined;
    return row ? map(row) : null;
  }

  listRecent(limit = 100): SupportEscalation[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return (this.db.prepare("SELECT * FROM support_escalations WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").all(this.tenantId, safeLimit) as Row[]).map(map);
  }

  listOpen(limit = 50): SupportEscalation[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return (this.db.prepare(`
      SELECT * FROM support_escalations
      WHERE tenant_id = ? AND status = 'OPEN'
      ORDER BY CASE priority WHEN 'HIGH' THEN 0 ELSE 1 END, created_at DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as Row[]).map(map);
  }

  assign(id: string, input: { assignedUserId: string | null; notes?: string | null }): SupportEscalation {
    const current = this.findById(id);
    if (!current) throw new Error("Escalation was not found.");
    if (current.status !== "OPEN") throw new Error("Resolved escalations cannot be reassigned.");
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE support_escalations
      SET assigned_user_id = ?, notes = COALESCE(?, notes), updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = 'OPEN'
    `).run(input.assignedUserId, input.notes?.slice(0, 1000) ?? null, now, this.tenantId, id);
    return this.findById(id)!;
  }

  resolve(id: string, input: { resolvedByUserId: string | null; notes?: string | null }): SupportEscalation {
    const current = this.findById(id);
    if (!current) throw new Error("Escalation was not found.");
    if (current.status === "RESOLVED") return current;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE support_escalations
      SET status = 'RESOLVED',
          resolved_by_user_id = ?,
          notes = COALESCE(?, notes),
          updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = 'OPEN'
    `).run(input.resolvedByUserId, input.notes?.slice(0, 1000) ?? null, now, this.tenantId, id);
    const updated = this.findById(id);
    if (!updated || updated.status !== "RESOLVED") {
      throw new Error("Escalation could not be resolved.");
    }
    return updated;
  }
}
