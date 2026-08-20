import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type {
  SupportMessage,
  SupportMessageRole,
  SupportSession,
  SupportSessionStatus,
} from "@/domain/support/types";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

interface SupportSessionRow {
  id: string;
  customer_id: string;
  order_id: string;
  status: SupportSessionStatus;
  created_at: string;
  updated_at: string;
}

interface SupportMessageRow {
  id: string;
  session_id: string;
  run_id: string | null;
  role: SupportMessageRole;
  content: string;
  created_at: string;
}

function mapSession(row: SupportSessionRow): SupportSession {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: SupportMessageRow): SupportMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export interface AdminConversationSummary {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  status: SupportSessionStatus;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageRole: SupportMessageRole | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationSummaryRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  order_id: string;
  status: SupportSessionStatus;
  message_count: number;
  last_message_preview: string | null;
  last_message_role: SupportMessageRole | null;
  created_at: string;
  updated_at: string;
}

export class SupportSessionRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  create(input: { customerId: string; orderId: string; accessTokenHash?: string | null; id?: string; createdAt?: string }): SupportSession {
    const id = input.id ?? `ses_${randomUUID()}`;
    const now = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO support_sessions (id, tenant_id, customer_id, order_id, status, access_token_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      )
      .run(id, this.tenantId, input.customerId, input.orderId, input.accessTokenHash ?? null, now, now);

    return this.findById(id)!;
  }

  findById(id: string): SupportSession | null {
    const row = this.db.prepare("SELECT * FROM support_sessions WHERE tenant_id = ? AND id = ?").get(this.tenantId, id) as
      | SupportSessionRow
      | undefined;
    return row ? mapSession(row) : null;
  }

  appendMessage(input: {
    sessionId: string;
    role: SupportMessageRole;
    content: string;
    runId?: string;
    id?: string;
    createdAt?: string;
  }): SupportMessage {
    const id = input.id ?? `msg_${randomUUID()}`;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const content = input.content.trim();
    if (!content) throw new Error("Support message content cannot be empty.");

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO support_messages (id, session_id, run_id, role, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.sessionId, input.runId ?? null, input.role, content, createdAt);
      this.db.prepare("UPDATE support_sessions SET updated_at = ? WHERE id = ?").run(createdAt, input.sessionId);
    });
    transaction.immediate();

    const row = this.db.prepare("SELECT * FROM support_messages WHERE id = ?").get(id) as SupportMessageRow;
    return mapMessage(row);
  }


  setMessageRunId(messageId: string, runId: string) {
    this.db.prepare("UPDATE support_messages SET run_id = ? WHERE id = ? AND run_id IS NULL").run(runId, messageId);
  }

  findMessageById(messageId: string): SupportMessage | null {
    const row = this.db.prepare("SELECT * FROM support_messages WHERE id = ?").get(messageId) as
      | SupportMessageRow
      | undefined;
    return row ? mapMessage(row) : null;
  }

  listMessages(sessionId: string): SupportMessage[] {
    const rows = this.db
      .prepare(`
        SELECT m.* FROM support_messages m
        JOIN support_sessions s ON s.id = m.session_id
        WHERE s.tenant_id = ? AND m.session_id = ?
        ORDER BY m.created_at, m.rowid
      `)
      .all(this.tenantId, sessionId) as SupportMessageRow[];
    return rows.map(mapMessage);
  }

  listConversations(limit = 80): AdminConversationSummary[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.db.prepare(`
      SELECT s.id, s.customer_id, c.name AS customer_name, c.email AS customer_email, s.order_id, s.status,
             s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM support_messages m WHERE m.session_id = s.id) AS message_count,
             (SELECT m.content FROM support_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message_preview,
             (SELECT m.role FROM support_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message_role
      FROM support_sessions s
      JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
      WHERE s.tenant_id = ?
      ORDER BY s.updated_at DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as ConversationSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      orderId: row.order_id,
      status: row.status,
      messageCount: row.message_count,
      lastMessagePreview: row.last_message_preview ? row.last_message_preview.slice(0, 180) : null,
      lastMessageRole: row.last_message_role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getConversation(sessionId: string): { session: SupportSession; messages: SupportMessage[]; customerName: string; customerEmail: string } | null {
    const row = this.db.prepare(`
      SELECT s.*, c.name AS customer_name, c.email AS customer_email
      FROM support_sessions s
      JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
      WHERE s.tenant_id = ? AND s.id = ?
    `).get(this.tenantId, sessionId) as (SupportSessionRow & { customer_name: string; customer_email: string }) | undefined;
    if (!row) return null;
    return {
      session: mapSession(row),
      messages: this.listMessages(sessionId),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
    };
  }
}
