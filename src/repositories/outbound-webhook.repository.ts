import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { OutboundWebhookEvent } from "@/domain/integrations/types";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export type OutboundWebhookStatus = "PENDING" | "SENT" | "DEAD";

export interface OutboundWebhookDelivery {
  id: string;
  tenantId: string;
  eventType: OutboundWebhookEvent;
  eventKey: string;
  payload: Record<string, unknown>;
  status: OutboundWebhookStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  responseStatus: number | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

interface Row {
  id: string;
  tenant_id: string;
  event_type: OutboundWebhookEvent;
  event_key: string;
  payload_json: string;
  status: OutboundWebhookStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  response_status: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

function map(row: Row): OutboundWebhookDelivery {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.payload_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    eventKey: row.event_key,
    payload,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    responseStatus: row.response_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  };
}

export class OutboundWebhookRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  enqueue(input: { eventType: OutboundWebhookEvent; eventKey: string; payload: Record<string, unknown> }) {
    const now = new Date().toISOString();
    const id = `whk_${randomUUID()}`;
    this.db.prepare(`
      INSERT OR IGNORE INTO outbound_webhook_deliveries (
        id, tenant_id, event_type, event_key, payload_json, status, attempts, next_attempt_at,
        last_error, response_status, created_at, updated_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, NULL, NULL, ?, ?, NULL)
    `).run(id, this.tenantId, input.eventType, input.eventKey, JSON.stringify(input.payload), now, now, now);
    return this.findByEventKey(input.eventKey)!;
  }

  findByEventKey(eventKey: string): OutboundWebhookDelivery | null {
    const row = this.db.prepare(
      "SELECT * FROM outbound_webhook_deliveries WHERE tenant_id = ? AND event_key = ?",
    ).get(this.tenantId, eventKey) as Row | undefined;
    return row ? map(row) : null;
  }

  listRecent(limit = 25): OutboundWebhookDelivery[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return (this.db.prepare(`
      SELECT * FROM outbound_webhook_deliveries
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as Row[]).map(map);
  }

  listDispatchable(nowIso: string, limit = 25): OutboundWebhookDelivery[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return (this.db.prepare(`
      SELECT * FROM outbound_webhook_deliveries
      WHERE status = 'PENDING' AND next_attempt_at <= ?
      ORDER BY created_at
      LIMIT ?
    `).all(nowIso, safeLimit) as Row[]).map(map);
  }

  markSent(id: string, responseStatus: number) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE outbound_webhook_deliveries
      SET status = 'SENT', response_status = ?, last_error = NULL, sent_at = ?, updated_at = ?, attempts = attempts + 1
      WHERE id = ?
    `).run(responseStatus, now, now, id);
  }

  markFailed(id: string, error: string, responseStatus?: number | null) {
    const now = new Date().toISOString();
    const row = this.db.prepare("SELECT attempts FROM outbound_webhook_deliveries WHERE id = ?").get(id) as { attempts: number } | undefined;
    const attempts = (row?.attempts ?? 0) + 1;
    const dead = attempts >= 8;
    const next = new Date(Date.now() + Math.min(30 * 60_000, 2 ** Math.min(attempts, 6) * 1000)).toISOString();
    this.db.prepare(`
      UPDATE outbound_webhook_deliveries
      SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, response_status = ?, updated_at = ?
      WHERE id = ?
    `).run(dead ? "DEAD" : "PENDING", attempts, next, error.slice(0, 1000), responseStatus ?? null, now, id);
  }
}
