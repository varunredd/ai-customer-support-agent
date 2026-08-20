import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Row {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function map(row: Row): AuditLogEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

export class AuditLogRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  record(input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): AuditLogEntry {
    const id = `aud_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO audit_logs (
        id, tenant_id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      this.tenantId,
      input.actorUserId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    );
    return this.findById(id)!;
  }

  findById(id: string): AuditLogEntry | null {
    const row = this.db.prepare(`
      SELECT a.*, u.email AS actor_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND a.id = ?
    `).get(this.tenantId, id) as Row | undefined;
    return row ? map(row) : null;
  }

  listRecent(limit = 100): AuditLogEntry[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return (this.db.prepare(`
      SELECT a.*, u.email AS actor_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
      ORDER BY a.created_at DESC, a.rowid DESC
      LIMIT ?
    `).all(this.tenantId, safeLimit) as Row[]).map(map);
  }
}
