import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type {
  SupportMessage,
  SupportMessageRole,
  SupportSession,
  SupportSessionStatus,
} from "@/domain/support/types";

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

export class SupportSessionRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: { customerId: string; orderId: string; id?: string; createdAt?: string }): SupportSession {
    const id = input.id ?? `ses_${randomUUID()}`;
    const now = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO support_sessions (id, customer_id, order_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'OPEN', ?, ?)`,
      )
      .run(id, input.customerId, input.orderId, now, now);

    return this.findById(id)!;
  }

  findById(id: string): SupportSession | null {
    const row = this.db.prepare("SELECT * FROM support_sessions WHERE id = ?").get(id) as
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

  listMessages(sessionId: string): SupportMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM support_messages WHERE session_id = ? ORDER BY created_at, id")
      .all(sessionId) as SupportMessageRow[];
    return rows.map(mapMessage);
  }
}
