import type { ItemCondition, RefundReason } from "@/domain/refunds/types";

export type RefundPolicyRuleCode =
  | "ACCOUNT_ACTIVE"
  | "RISK_NOT_HIGH"
  | "ORDER_OWNERSHIP"
  | "ORDER_DELIVERED"
  | "WITHIN_WINDOW"
  | "ITEM_REFUNDABLE"
  | "NOT_FINAL_SALE"
  | "VALID_QUANTITY"
  | "CONDITION_ALLOWED"
  | "REMAINING_BALANCE";

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

export const POLICY_RULE_TEMPLATE: RefundPolicyRule[] = [
  {
    code: "ACCOUNT_ACTIVE",
    title: "Account must be active",
    text: "Refunds cannot be processed for suspended customer accounts.",
    enabled: true,
  },
  {
    code: "RISK_NOT_HIGH",
    title: "High-risk accounts are ineligible",
    text: "Accounts currently classified as HIGH risk are not eligible for automated refunds.",
    enabled: true,
  },
  {
    code: "ORDER_OWNERSHIP",
    title: "Order ownership",
    text: "The requesting customer must own the order.",
    enabled: true,
  },
  {
    code: "ORDER_DELIVERED",
    title: "Delivered orders only",
    text: "Refund requests are accepted only after the order has been delivered.",
    enabled: true,
  },
  {
    code: "WITHIN_WINDOW",
    title: "Refund window",
    text: "A refund request must be submitted within the active policy return window after delivery.",
    enabled: true,
  },
  {
    code: "ITEM_REFUNDABLE",
    title: "Refundable item",
    text: "Items explicitly marked non-refundable are never eligible.",
    enabled: true,
  },
  {
    code: "NOT_FINAL_SALE",
    title: "No final-sale refunds",
    text: "Final-sale merchandise cannot be refunded.",
    enabled: true,
  },
  {
    code: "VALID_QUANTITY",
    title: "Valid quantity",
    text: "The requested refund quantity must be at least one and cannot exceed the remaining unrefunded purchased quantity.",
    enabled: true,
  },
  {
    code: "CONDITION_ALLOWED",
    title: "Condition requirement",
    text: "Item condition must satisfy the rule for the selected refund reason.",
    enabled: true,
    config: { allowedConditionsByReason: DEFAULT_CONDITION_ALLOWED },
  },
  {
    code: "REMAINING_BALANCE",
    title: "No over-refunding",
    text: "The item refund cannot make cumulative refunds exceed the order amount paid. Shipping is excluded from automated refunds.",
    enabled: true,
  },
];

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
}): RefundPolicyDefinition {
  return {
    version: input.version,
    refundWindowDays: input.refundWindowDays,
    rules: input.rules ?? POLICY_RULE_TEMPLATE.map((rule) => ({ ...rule, config: rule.config ? { ...rule.config } : undefined })),
  };
}
