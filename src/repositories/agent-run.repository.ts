import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type {
  AgentEventStatus,
  AgentEventType,
  AgentRunStatus,
  PersistedAgentEvent,
  PersistedAgentRun,
} from "@/domain/agent/types";

interface AgentRunRow {
  id: string;
  status: AgentRunStatus;
  model: string;
  input_text: string;
  customer_id: string | null;
  order_id: string | null;
  final_output: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AgentEventRow {
  id: string;
  run_id: string;
  sequence: number;
  type: AgentEventType;
  status: AgentEventStatus | null;
  title: string;
  tool_name: string | null;
  call_id: string | null;
  duration_ms: number | null;
  metadata_json: string | null;
  created_at: string;
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function mapEvent(row: AgentEventRow): PersistedAgentEvent {
  return {
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    status: row.status,
    title: row.title,
    toolName: row.tool_name,
    callId: row.call_id,
    durationMs: row.duration_ms,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapRun(row: AgentRunRow): PersistedAgentRun {
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    inputText: row.input_text,
    customerId: row.customer_id,
    orderId: row.order_id,
    finalOutput: row.final_output,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export class AgentRunRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: { id?: string; model: string; inputText: string; startedAt?: string }) {
    const id = input.id ?? `run_${randomUUID()}`;
    const startedAt = input.startedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO agent_runs (id, status, model, input_text, started_at)
         VALUES (?, 'IN_PROGRESS', ?, ?, ?)`,
      )
      .run(id, input.model, input.inputText, startedAt);
    return id;
  }

  appendEvent(input: {
    runId: string;
    type: AgentEventType;
    status?: AgentEventStatus;
    title: string;
    toolName?: string;
    callId?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }) {
    const transaction = this.db.transaction(() => {
      const next = this.db
        .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM agent_events WHERE run_id = ?")
        .get(input.runId) as { sequence: number };
      const id = `evt_${randomUUID()}`;
      this.db
        .prepare(
          `INSERT INTO agent_events (
            id, run_id, sequence, type, status, title, tool_name, call_id, duration_ms, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.runId,
          next.sequence,
          input.type,
          input.status ?? null,
          input.title,
          input.toolName ?? null,
          input.callId ?? null,
          input.durationMs ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
          input.createdAt ?? new Date().toISOString(),
        );
      return id;
    });

    return transaction.immediate();
  }

  setContext(runId: string, input: { customerId?: string; orderId?: string }) {
    const current = this.db.prepare("SELECT customer_id, order_id FROM agent_runs WHERE id = ?").get(runId) as
      | { customer_id: string | null; order_id: string | null }
      | undefined;
    if (!current) return;
    this.db
      .prepare("UPDATE agent_runs SET customer_id = ?, order_id = ? WHERE id = ?")
      .run(input.customerId ?? current.customer_id, input.orderId ?? current.order_id, runId);
  }

  complete(runId: string, finalOutput: string) {
    this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'COMPLETED', final_output = ?, completed_at = ?, error_code = NULL, error_message = NULL
         WHERE id = ?`,
      )
      .run(finalOutput, new Date().toISOString(), runId);
  }

  fail(runId: string, code: string, message: string) {
    this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'FAILED', error_code = ?, error_message = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(code, message, new Date().toISOString(), runId);
  }

  findById(runId: string, includeEvents = true): PersistedAgentRun | null {
    const row = this.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId) as AgentRunRow | undefined;
    if (!row) return null;
    const run = mapRun(row);
    if (includeEvents) {
      const events = this.db
        .prepare("SELECT * FROM agent_events WHERE run_id = ? ORDER BY sequence")
        .all(runId) as AgentEventRow[];
      run.events = events.map(mapEvent);
    }
    return run;
  }

  listRecent(limit = 50): PersistedAgentRun[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.db
      .prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?")
      .all(safeLimit) as AgentRunRow[];
    return rows.map(mapRun);
  }
}
