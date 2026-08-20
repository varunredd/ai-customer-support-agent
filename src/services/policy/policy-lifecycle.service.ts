import {
  mergePolicyRulesWithCatalog,
  type RefundPolicyRule,
} from "@/domain/refunds/policy";
import { POLICY_CATALOG } from "@/domain/refunds/policy-catalog";
import type { PersistedRefundPolicy } from "@/repositories/refund-policy.repository";

export interface PolicyValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  enabledCount: number;
  totalCatalogRules: number;
}

export function validatePolicyForPublish(input: {
  version: string;
  refundWindowDays: number;
  rules: RefundPolicyRule[];
}): PolicyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const version = input.version.trim();
  if (!version) errors.push("Version label is required.");
  if (version.length > 80) errors.push("Version label must be at most 80 characters.");
  if (!Number.isInteger(input.refundWindowDays) || input.refundWindowDays < 1 || input.refundWindowDays > 365) {
    errors.push("Return window must be an integer between 1 and 365 days.");
  }

  const rules = mergePolicyRulesWithCatalog(input.rules);
  const enabled = rules.filter((rule) => rule.enabled);
  if (enabled.length === 0) {
    errors.push("Enable at least one policy check before publishing.");
  }

  const codes = new Set(rules.map((rule) => rule.code));
  for (const entry of POLICY_CATALOG) {
    if (!codes.has(entry.code)) {
      warnings.push(`Catalog rule ${entry.code} is missing and will be backfilled on save.`);
    }
  }

  for (const rule of rules) {
    if (!rule.title.trim() || !rule.text.trim()) {
      errors.push(`Rule ${rule.code} needs a title and description.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    enabledCount: enabled.length,
    totalCatalogRules: POLICY_CATALOG.length,
  };
}

export function validatePersistedPolicy(policy: PersistedRefundPolicy): PolicyValidationResult {
  return validatePolicyForPublish({
    version: policy.version,
    refundWindowDays: policy.refundWindowDays,
    rules: policy.rules,
  });
}

export function nextDraftVersionLabel(existingVersions: string[]): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `draft-${stamp}`;
  if (!existingVersions.includes(base)) return base;
  let index = 2;
  while (existingVersions.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}
