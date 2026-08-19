import type { ItemCondition, RefundReason } from "@/domain/refunds/types";
import {
  catalogRuleTemplates,
  mergePolicyRulesWithCatalog,
  policyRulesNeedCatalogBackfill,
  type RefundPolicyRuleCode as CatalogRuleCode,
} from "@/domain/refunds/policy-catalog";

export type RefundPolicyRuleCode = CatalogRuleCode;

export interface RefundPolicyRule {
  code: RefundPolicyRuleCode;
  title: string;
  text: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface RefundPolicyDefinition {
  version: string;
  refundWindowDays: number;
  rules: RefundPolicyRule[];
}

export type ConditionAllowedConfig = Partial<Record<RefundReason, ItemCondition[]>>;

export const REFUND_REASONS: RefundReason[] = [
  "CHANGED_MIND",
  "DAMAGED",
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "LATE_DELIVERY",
];

export const ITEM_CONDITIONS: ItemCondition[] = ["UNOPENED", "OPENED", "USED", "DAMAGED"];

export const DEFAULT_CONDITION_ALLOWED: ConditionAllowedConfig = {
  CHANGED_MIND: ["UNOPENED"],
  LATE_DELIVERY: ["UNOPENED"],
  NOT_AS_DESCRIBED: ["UNOPENED", "OPENED"],
  DAMAGED: ["UNOPENED", "OPENED", "DAMAGED"],
  WRONG_ITEM: ["UNOPENED", "OPENED", "DAMAGED"],
};

export function conditionAllowedConfig(policy: RefundPolicyDefinition): ConditionAllowedConfig {
  const rule = policy.rules.find((entry) => entry.code === "CONDITION_ALLOWED" && entry.enabled);
  const configured = rule?.config?.allowedConditionsByReason;
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
    return DEFAULT_CONDITION_ALLOWED;
  }
  return { ...DEFAULT_CONDITION_ALLOWED, ...(configured as ConditionAllowedConfig) };
}

export function enabledRuleCodes(policy: RefundPolicyDefinition): Set<RefundPolicyRuleCode> {
  return new Set(policy.rules.filter((rule) => rule.enabled).map((rule) => rule.code));
}

export function buildPolicyDefinition(input: {
  version: string;
  refundWindowDays: number;
  rules?: RefundPolicyRule[];
  enableCore?: boolean;
}): RefundPolicyDefinition {
  return {
    version: input.version,
    refundWindowDays: input.refundWindowDays,
    rules: input.rules ?? catalogRuleTemplates({ enableCore: input.enableCore ?? false }).map((rule) => ({
      ...rule,
      config: rule.config ? { ...rule.config } : undefined,
    })),
  };
}

export { catalogRuleTemplates, mergePolicyRulesWithCatalog, policyRulesNeedCatalogBackfill };
