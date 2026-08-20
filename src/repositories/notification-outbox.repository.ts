import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export type NotificationStatus = "PENDING" | "SENT" | "DEAD";

export interface NotificationRecord {
  id: string;
  eventKey: string;
  eventType: string;
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: string;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

interface Row {
  id: string;
  event_key: string;
  event_type: string;
  recipient: string;
  subject: string;
  payload_json: string;
  status: NotificationStatus;
  attempts: number;
  next_attempt_at: string;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

function map(row: Row): NotificationRecord {
  const parsed: unknown = JSON.parse(row.payload_json);
  return {
    id: row.id,
    eventKey: row.event_key,
    eventType: row.event_type,
    recipient: row.recipient,
    subject: row.subject,
    payload: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    providerMessageId: row.provider_message_id,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  };
}

export class NotificationOutboxRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  enqueue(input: {
    eventKey: string;
    eventType: string;
    recipient: string;
    subject: string;
    payload: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const id = `ntf_${randomUUID()}`;
    this.db.prepare(`INSERT OR IGNORE INTO notification_outbox (
      id, tenant_id, event_key, event_type, recipient, subject, payload_json, status,
      attempts, next_attempt_at, provider_message_id, last_error, created_at, updated_at, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, NULL, NULL, ?, ?, NULL)`)
      .run(id, this.tenantId, input.eventKey, input.eventType, input.recipient, input.subject, JSON.stringify(input.payload), now, now, now);
    return this.findByEventKey(input.eventKey);
  }

  findByEventKey(eventKey: string): NotificationRecord | null {
    const row = this.db.prepare("SELECT * FROM notification_outbox WHERE tenant_id = ? AND event_key = ?").get(this.tenantId, eventKey) as Row | undefined;
    return row ? map(row) : null;
  }

  listDispatchable(now = new Date().toISOString(), limit = 25): NotificationRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return (this.db.prepare(`SELECT * FROM notification_outbox
      WHERE tenant_id = ? AND status = 'PENDING' AND next_attempt_at <= ?
      ORDER BY created_at ASC LIMIT ?`).all(this.tenantId, now, safeLimit) as Row[]).map(map);
  }

  markSent(id: string, providerMessageId: string) {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE notification_outbox SET
      status = 'SENT', provider_message_id = ?, last_error = NULL,
      updated_at = ?, sent_at = ? WHERE id = ? AND tenant_id = ?`).run(providerMessageId, now, now, id, this.tenantId);
  }

  markFailed(id: string, errorMessage: string, maxAttempts = 5) {
    const row = this.db.prepare("SELECT attempts FROM notification_outbox WHERE id = ? AND tenant_id = ?").get(id, this.tenantId) as { attempts: number } | undefined;
    if (!row) return;
    const attempts = row.attempts + 1;
    const dead = attempts >= maxAttempts;
    const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
    const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE notification_outbox SET
      status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?`).run(dead ? "DEAD" : "PENDING", attempts, nextAttemptAt, errorMessage.slice(0, 1000), now, id, this.tenantId);
  }

  listRecent(limit = 50): NotificationRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return (this.db.prepare("SELECT * FROM notification_outbox WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").all(this.tenantId, safeLimit) as Row[]).map(map);
  }
}
