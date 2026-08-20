import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { IntegrationProvider } from "@/domain/integrations/types";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";

export type IntegrationStatus = "ACTIVE" | "DISABLED";

export interface TenantIntegration {
  id: string;
  tenantId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  credentialsEncrypted: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  tenant_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config_json: string;
  credentials_encrypted: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function parseConfig(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Fall through to empty config.
  }
  return {};
}

function map(row: Row): TenantIntegration {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    status: row.status,
    config: parseConfig(row.config_json),
    credentialsEncrypted: row.credentials_encrypted,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TenantIntegrationRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: AppDatabase,
    tenantId?: string,
  ) {
    this.tenantId = resolveTenantId(db, tenantId);
  }

  findByProvider(provider: IntegrationProvider): TenantIntegration | null {
    const row = this.db.prepare(
      "SELECT * FROM tenant_integrations WHERE tenant_id = ? AND provider = ?",
    ).get(this.tenantId, provider) as Row | undefined;
    return row ? map(row) : null;
  }

  list(): TenantIntegration[] {
    return (this.db.prepare(
      "SELECT * FROM tenant_integrations WHERE tenant_id = ? ORDER BY provider",
    ).all(this.tenantId) as Row[]).map(map);
  }

  upsert(input: {
    provider: IntegrationProvider;
    status?: IntegrationStatus;
    config: Record<string, unknown>;
    credentialsEncrypted?: string | null;
    lastError?: string | null;
  }): TenantIntegration {
    const existing = this.findByProvider(input.provider);
    const now = new Date().toISOString();
    const status = input.status ?? existing?.status ?? "ACTIVE";
    const credentials = input.credentialsEncrypted === undefined
      ? existing?.credentialsEncrypted ?? null
      : input.credentialsEncrypted;
    if (existing) {
      this.db.prepare(`
        UPDATE tenant_integrations
        SET status = ?, config_json = ?, credentials_encrypted = ?, last_error = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `).run(status, JSON.stringify(input.config), credentials, input.lastError ?? null, now, this.tenantId, existing.id);
      return this.findByProvider(input.provider)!;
    }
    const id = `int_${randomUUID()}`;
    this.db.prepare(`
      INSERT INTO tenant_integrations (
        id, tenant_id, provider, status, config_json, credentials_encrypted, last_sync_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(id, this.tenantId, input.provider, status, JSON.stringify(input.config), credentials, input.lastError ?? null, now, now);
    return this.findByProvider(input.provider)!;
  }
}
