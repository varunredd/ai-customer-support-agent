import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import {
  buildPolicyDefinition,
  POLICY_RULE_TEMPLATE,
  type RefundPolicyDefinition,
  type RefundPolicyRule,
  type RefundPolicyRuleCode,
} from "@/domain/refunds/policy";

export type RefundPolicyStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface PersistedRefundPolicy extends RefundPolicyDefinition {
  id: string;
  status: RefundPolicyStatus;
  createdAt: string;
  publishedAt: string | null;
}

export class RefundPolicyNotFoundError extends Error {
  readonly code = "REFUND_POLICY_NOT_FOUND";

  constructor(message = "No active refund policy is published.") {
    super(message);
  }
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

const RULE_CODES = new Set<RefundPolicyRuleCode>(POLICY_RULE_TEMPLATE.map((rule) => rule.code));

function cloneRules(rules: RefundPolicyRule[]): RefundPolicyRule[] {
  return rules.map((rule) => ({
    ...rule,
    config: rule.config ? JSON.parse(JSON.stringify(rule.config)) as Record<string, unknown> : undefined,
  }));
}

function normalizeRules(rules: RefundPolicyRule[]): RefundPolicyRule[] {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  return rules.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Policy rules must be objects.");
    }
    const code = typeof entry.code === "string" ? entry.code.trim() : "";
    if (!RULE_CODES.has(code as RefundPolicyRuleCode)) {
      throw new Error(`Unsupported policy rule code: ${code || "(missing)"}.`);
    }
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!title || !text) {
      throw new Error(`Rule ${code} requires a title and description.`);
    }
    if (seen.has(code)) {
      throw new Error(`Duplicate policy rule code: ${code}.`);
    }
    seen.add(code);
    return {
      code: code as RefundPolicyRuleCode,
      title: title.slice(0, 120),
      text: text.slice(0, 1000),
      enabled: entry.enabled !== false,
      config: entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)
        ? entry.config as Record<string, unknown>
        : undefined,
    };
  });
}

function parseRules(value: string): RefundPolicyRule[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Persisted refund policy rules are corrupt.");
  return normalizeRules(parsed as RefundPolicyRule[]);
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

  getActiveOrNull(): PersistedRefundPolicy | null {
    const row = this.db
      .prepare("SELECT * FROM refund_policy_versions WHERE status = 'ACTIVE' LIMIT 1")
      .get() as PolicyRow | undefined;
    return row ? mapPolicy(row) : null;
  }

  getActive(): PersistedRefundPolicy {
    const active = this.getActiveOrNull();
    if (!active) throw new RefundPolicyNotFoundError();
    return active;
  }

  list(): PersistedRefundPolicy[] {
    return (this.db
      .prepare(`SELECT * FROM refund_policy_versions
        ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, created_at DESC`)
      .all() as PolicyRow[]).map(mapPolicy);
  }

  createActive(input: {
    refundWindowDays: number;
    rules?: RefundPolicyRule[];
    version?: string;
  }): PersistedRefundPolicy {
    if (this.getActiveOrNull()) {
      throw new Error("A refund policy already exists. Save changes to update it.");
    }
    const version = (input.version ?? new Date().toISOString().slice(0, 10)).trim();
    if (!version || version.length > 80) {
      throw new Error("Policy version is required and must be at most 80 characters.");
    }
    if (!Number.isInteger(input.refundWindowDays) || input.refundWindowDays < 1 || input.refundWindowDays > 365) {
      throw new Error("Refund window must be an integer between 1 and 365 days.");
    }
    const rules = input.rules !== undefined
      ? normalizeRules(input.rules)
      : normalizeRules(cloneRules(POLICY_RULE_TEMPLATE));
    const id = `pol_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare("DELETE FROM refund_policy_versions WHERE status = 'DRAFT'").run();
    this.db
      .prepare(`INSERT INTO refund_policy_versions (
        id, version, status, refund_window_days, rules_json, created_at, published_at
      ) VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?)`)
      .run(id, version, input.refundWindowDays, JSON.stringify(rules), now, now);
    return this.findById(id)!;
  }

  /** If staff left a lone draft behind, promote it so the console stays simple. */
  activatePendingDraft(): PersistedRefundPolicy | null {
    if (this.getActiveOrNull()) return null;
    const draft = this.db
      .prepare("SELECT * FROM refund_policy_versions WHERE status = 'DRAFT' ORDER BY created_at DESC LIMIT 1")
      .get() as PolicyRow | undefined;
    if (!draft) return null;
    return this.publish(draft.id);
  }

  createDraft(input: {
    version: string;
    refundWindowDays: number;
    rules?: RefundPolicyRule[];
    sourcePolicyId?: string;
  }): PersistedRefundPolicy {
    const version = input.version.trim();
    if (!version || version.length > 80) throw new Error("Policy version is required and must be at most 80 characters.");
    if (!Number.isInteger(input.refundWindowDays) || input.refundWindowDays < 1 || input.refundWindowDays > 365) {
      throw new Error("Refund window must be an integer between 1 and 365 days.");
    }

    let rules = input.rules;
    if (!rules && input.sourcePolicyId) {
      const source = this.findById(input.sourcePolicyId);
      if (!source) throw new Error("Source refund policy was not found.");
      rules = cloneRules(source.rules);
    }
    if (!rules) {
      rules = cloneRules(POLICY_RULE_TEMPLATE);
    }

    const normalized = normalizeRules(rules);
    const id = `pol_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO refund_policy_versions (
        id, version, status, refund_window_days, rules_json, created_at, published_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, NULL)`)
      .run(id, version, input.refundWindowDays, JSON.stringify(normalized), now);
    return this.findById(id)!;
  }

  updateDraft(id: string, input: {
    version?: string;
    refundWindowDays?: number;
    rules?: RefundPolicyRule[];
  }): PersistedRefundPolicy {
    const current = this.findById(id);
    if (!current) throw new Error("Refund policy was not found.");
    if (current.status !== "DRAFT") {
      throw new Error("Only draft policies can be edited.");
    }

    return this.savePolicy(id, current.status, input);
  }

  updateActive(input: {
    version?: string;
    refundWindowDays?: number;
    rules?: RefundPolicyRule[];
  }): PersistedRefundPolicy {
    const current = this.getActiveOrNull();
    if (!current) throw new Error("No active refund policy is published.");
    return this.savePolicy(current.id, "ACTIVE", input);
  }

  private savePolicy(
    id: string,
    status: RefundPolicyStatus,
    input: { version?: string; refundWindowDays?: number; rules?: RefundPolicyRule[] },
  ): PersistedRefundPolicy {
    const current = this.findById(id);
    if (!current) throw new Error("Refund policy was not found.");

    const version = input.version !== undefined ? input.version.trim() : current.version;
    if (!version || version.length > 80) {
      throw new Error("Policy version is required and must be at most 80 characters.");
    }
    const refundWindowDays = input.refundWindowDays ?? current.refundWindowDays;
    if (!Number.isInteger(refundWindowDays) || refundWindowDays < 1 || refundWindowDays > 365) {
      throw new Error("Refund window must be an integer between 1 and 365 days.");
    }
    const rules = input.rules ? normalizeRules(input.rules) : current.rules;

    this.db
      .prepare(`UPDATE refund_policy_versions
        SET version = ?, refund_window_days = ?, rules_json = ?
        WHERE id = ? AND status = ?`)
      .run(version, refundWindowDays, JSON.stringify(rules), id, status);
    return this.findById(id)!;
  }

  deletePolicy(id: string) {
    const current = this.findById(id);
    if (!current) throw new Error("Refund policy was not found.");
    if (current.status === "ACTIVE") {
      throw new Error("The active policy cannot be deleted. Publish a replacement first.");
    }
    this.db.prepare("DELETE FROM refund_policy_versions WHERE id = ?").run(id);
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

export { buildPolicyDefinition, POLICY_RULE_TEMPLATE };
