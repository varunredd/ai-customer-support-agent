import type { AppDatabase } from "@/db/database";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "@/domain/tenant/constants";

export type TenantStatus = "ACTIVE" | "SUSPENDED";

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

function mapTenant(row: TenantRow): TenantRecord {
  let settings: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.settings_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>;
    }
  } catch {
    settings = {};
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TenantRepository {
  constructor(private readonly db: AppDatabase) {}

  findById(id: string): TenantRecord | null {
    const row = this.db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as TenantRow | undefined;
    return row ? mapTenant(row) : null;
  }

  findBySlug(slug: string): TenantRecord | null {
    const row = this.db.prepare("SELECT * FROM tenants WHERE slug = ? COLLATE NOCASE").get(slug.trim()) as
      | TenantRow
      | undefined;
    return row ? mapTenant(row) : null;
  }

  listActive(): TenantRecord[] {
    return (this.db.prepare("SELECT * FROM tenants WHERE status = 'ACTIVE' ORDER BY created_at").all() as TenantRow[])
      .map(mapTenant);
  }

  ensureDefaultTenant(): TenantRecord {
    const configuredSlug = process.env.DEFAULT_TENANT_SLUG?.trim() || DEFAULT_TENANT_SLUG;
    const existing = this.findBySlug(configuredSlug) ?? this.findById(DEFAULT_TENANT_ID);
    if (existing) return existing;

    const now = new Date().toISOString();
    const name = process.env.DEFAULT_TENANT_NAME?.trim() || "Default Merchant";
    this.db.prepare(`INSERT INTO tenants (
      id, name, slug, status, settings_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'ACTIVE', '{}', ?, ?)`)
      .run(DEFAULT_TENANT_ID, name, configuredSlug, now, now);
    return this.findById(DEFAULT_TENANT_ID)!;
  }

  updateSettings(id: string, settings: Record<string, unknown>): TenantRecord {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE tenants SET settings_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(settings), now, id);
    const updated = this.findById(id);
    if (!updated) throw new Error("Tenant was not found.");
    return updated;
  }
}
