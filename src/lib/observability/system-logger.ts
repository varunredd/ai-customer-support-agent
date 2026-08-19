import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { redactMetadata } from "@/lib/security/redaction";

export type LogSeverity = "INFO" | "WARN" | "ERROR";

export interface OperationalEventInput {
  severity: LogSeverity;
  source: string;
  code: string;
  message: string;
  requestId?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}

export function operationalLog(input: OperationalEventInput, db?: AppDatabase) {
  const createdAt = new Date().toISOString();
  const safeMetadata = input.metadata ? redactMetadata(input.metadata) : undefined;
  const record = {
    timestamp: createdAt,
    severity: input.severity,
    source: input.source,
    code: input.code,
    message: input.message,
    requestId: input.requestId ?? null,
    runId: input.runId ?? null,
    metadata: safeMetadata ?? null,
  };

  const line = JSON.stringify(record);
  if (input.severity === "ERROR") console.error(line);
  else if (input.severity === "WARN") console.warn(line);
  else console.info(line);

  if (!db) return;
  try {
    db.prepare(`INSERT INTO operational_events (
      id, severity, source, code, message, request_id, run_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        `ops_${randomUUID()}`,
        input.severity,
        input.source,
        input.code,
        input.message.slice(0, 1000),
        input.requestId ?? null,
        input.runId ?? null,
        safeMetadata ? JSON.stringify(safeMetadata) : null,
        createdAt,
      );
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: "ERROR",
      source: "system-logger",
      code: "OPERATIONAL_EVENT_PERSIST_FAILED",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

export function listOperationalEvents(db: AppDatabase, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  return db.prepare(`SELECT id, severity, source, code, message, request_id AS requestId,
    run_id AS runId, metadata_json AS metadataJson, created_at AS createdAt
    FROM operational_events ORDER BY created_at DESC LIMIT ?`).all(safeLimit) as Array<{
      id: string;
      severity: LogSeverity;
      source: string;
      code: string;
      message: string;
      requestId: string | null;
      runId: string | null;
      metadataJson: string | null;
      createdAt: string;
    }>;
}
