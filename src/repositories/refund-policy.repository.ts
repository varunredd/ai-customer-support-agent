import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { DEFAULT_REFUND_POLICY, type RefundPolicyDefinition, type RefundPolicyRule } from "@/domain/refunds/policy";

export type RefundPolicyStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface PersistedRefundPolicy extends RefundPolicyDefinition {
  id: string;
  status: RefundPolicyStatus;
  createdAt: string;
  publishedAt: string | null;
}

interface PolicyRow {
  id: string;
  version: string;
  status: RefundPolicyStatus;
  refund_window_days: number;
  rules_json: string;
  created_at: string;
  published_at: string | null;
}

function parseRules(value: string): RefundPolicyRule[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Persisted refund policy rules are corrupt.");
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Persisted refund policy rule is invalid.");
    const rule = entry as Record<string, unknown>;
    if (typeof rule.code !== "string" || typeof rule.title !== "string" || typeof rule.text !== "string") {
      throw new Error("Persisted refund policy rule is invalid.");
    }
    return { code: rule.code, title: rule.title, text: rule.text };
  });
}

function mapPolicy(row: PolicyRow): PersistedRefundPolicy {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    refundWindowDays: row.refund_window_days,
    rules: parseRules(row.rules_json),
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export class RefundPolicyRepository {
  constructor(private readonly db: AppDatabase) {}

  ensureDefault(): PersistedRefundPolicy {
    const active = this.getActiveOrNull();
    if (active) return active;

    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT * FROM refund_policy_versions WHERE version = ?")
      .get(DEFAULT_REFUND_POLICY.version) as PolicyRow | undefined;

    if (existing) {
      const publish = this.db.transaction(() => {
        this.db.prepare("UPDATE refund_policy_versions SET status = 'ARCHIVED' WHERE status = 'ACTIVE'").run();
        this.db
          .prepare("UPDATE refund_policy_versions SET status = 'ACTIVE', published_at = COALESCE(published_at, ?) WHERE id = ?")
          .run(now, existing.id);
      });
      publish.immediate();
      return this.getActive();
    }

    const id = `pol_${randomUUID()}`;
    this.db
      .prepare(`INSERT INTO refund_policy_versions (
        id, version, status, refund_window_days, rules_json, created_at, published_at
      ) VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?)`)
      .run(
        id,
        DEFAULT_REFUND_POLICY.version,
        DEFAULT_REFUND_POLICY.refundWindowDays,
        JSON.stringify(DEFAULT_REFUND_POLICY.rules),
        now,
        now,
      );
    return this.getActive();
  }

  getActiveOrNull(): PersistedRefundPolicy | null {
    const row = this.db
      .prepare("SELECT * FROM refund_policy_versions WHERE status = 'ACTIVE' LIMIT 1")
      .get() as PolicyRow | undefined;
    return row ? mapPolicy(row) : null;
  }

  getActive(): PersistedRefundPolicy {
    return this.getActiveOrNull() ?? this.ensureDefault();
  }

  list(): PersistedRefundPolicy[] {
    return (this.db
      .prepare(`SELECT * FROM refund_policy_versions
        ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, created_at DESC`)
      .all() as PolicyRow[]).map(mapPolicy);
  }

  createDraft(input: { version: string; refundWindowDays: number; rules?: RefundPolicyRule[] }): PersistedRefundPolicy {
    const version = input.version.trim();
    if (!version || version.length > 80) throw new Error("Policy version is required and must be at most 80 characters.");
    if (!Number.isInteger(input.refundWindowDays) || input.refundWindowDays < 1 || input.refundWindowDays > 365) {
      throw new Error("Refund window must be an integer between 1 and 365 days.");
    }
    const active = this.getActive();
    const rules = input.rules ?? active.rules;
    const id = `pol_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO refund_policy_versions (
        id, version, status, refund_window_days, rules_json, created_at, published_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, NULL)`)
      .run(id, version, input.refundWindowDays, JSON.stringify(rules), now);
    return this.findById(id)!;
  }

  publish(id: string): PersistedRefundPolicy {
    const target = this.findById(id);
    if (!target) throw new Error("Refund policy was not found.");
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE refund_policy_versions SET status = 'ARCHIVED' WHERE status = 'ACTIVE' AND id <> ?").run(id);
      this.db.prepare("UPDATE refund_policy_versions SET status = 'ACTIVE', published_at = ? WHERE id = ?").run(now, id);
    });
    tx.immediate();
    return this.findById(id)!;
  }

  findById(id: string): PersistedRefundPolicy | null {
    const row = this.db.prepare("SELECT * FROM refund_policy_versions WHERE id = ?").get(id) as PolicyRow | undefined;
    return row ? mapPolicy(row) : null;
  }
}
