const DEFAULT_CONDITION_ALLOWED = {
  CHANGED_MIND: ["UNOPENED"],
  LATE_DELIVERY: ["UNOPENED"],
  NOT_AS_DESCRIBED: ["UNOPENED", "OPENED"],
  DAMAGED: ["UNOPENED", "OPENED", "DAMAGED"],
  WRONG_ITEM: ["UNOPENED", "OPENED", "DAMAGED"],
} as const;

export interface CatalogRuleTemplate {
  code: RefundPolicyRuleCode;
  title: string;
  text: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export type PolicyRuleCategory =
  | "Customer account"
  | "Order eligibility"
  | "Time windows"
  | "Item & product"
  | "Refund reasons"
  | "Item condition"
  | "Amount limits";

export interface PolicyCatalogEntry {
  code: string;
  title: string;
  text: string;
  category: PolicyRuleCategory;
  defaultConfig?: Record<string, unknown>;
}

export const POLICY_RULE_CATEGORIES: PolicyRuleCategory[] = [
  "Customer account",
  "Order eligibility",
  "Time windows",
  "Item & product",
  "Refund reasons",
  "Item condition",
  "Amount limits",
];

export const POLICY_CATALOG: PolicyCatalogEntry[] = [
  // Customer account (8)
  {
    code: "ACCOUNT_ACTIVE",
    title: "Account must be active",
    text: "Refunds cannot be processed for suspended customer accounts.",
    category: "Customer account",
  },
  {
    code: "RISK_NOT_HIGH",
    title: "High-risk accounts are ineligible",
    text: "Accounts currently classified as HIGH risk are not eligible for automated refunds.",
    category: "Customer account",
  },
  {
    code: "MIN_ACCOUNT_AGE_DAYS",
    title: "Minimum account age",
    text: "The customer account must be at least the configured number of days old.",
    category: "Customer account",
    defaultConfig: { minDays: 0 },
  },
  {
    code: "MAX_LIFETIME_REFUNDS",
    title: "Lifetime refund cap",
    text: "Customers who exceed the configured lifetime refund count are ineligible.",
    category: "Customer account",
    defaultConfig: { maxRefunds: 15 },
  },
  {
    code: "REFUND_TO_ORDER_RATIO",
    title: "Refund-to-order ratio",
    text: "Lifetime refunds divided by lifetime orders must stay below the configured ratio.",
    category: "Customer account",
    defaultConfig: { maxRatio: 0.75 },
  },
  {
    code: "NEW_CUSTOMER_MIN_ORDERS",
    title: "New customer minimum orders",
    text: "Customers must have completed at least the configured number of orders before requesting refunds.",
    category: "Customer account",
    defaultConfig: { minOrders: 0 },
  },
  {
    code: "MEDIUM_RISK_ALLOWED",
    title: "Medium-risk eligibility",
    text: "When disabled, only LOW-risk customers pass automated refund checks.",
    category: "Customer account",
    defaultConfig: { allowMedium: true },
  },
  {
    code: "MIN_LIFETIME_ORDERS",
    title: "Minimum lifetime orders",
    text: "The customer must have at least the configured lifetime order count.",
    category: "Customer account",
    defaultConfig: { minOrders: 1 },
  },

  // Order eligibility (8)
  {
    code: "ORDER_OWNERSHIP",
    title: "Order ownership",
    text: "The requesting customer must own the order.",
    category: "Order eligibility",
  },
  {
    code: "ORDER_DELIVERED",
    title: "Delivered orders only",
    text: "Refund requests are accepted only after the order has been delivered.",
    category: "Order eligibility",
  },
  {
    code: "ORDER_NOT_CANCELLED",
    title: "Order not cancelled",
    text: "Cancelled orders cannot receive item refunds.",
    category: "Order eligibility",
  },
  {
    code: "ORDER_FULLY_PAID",
    title: "Order fully paid",
    text: "The order must have a positive amount paid before any refund is issued.",
    category: "Order eligibility",
  },
  {
    code: "ORDER_HAS_REMAINING_BALANCE",
    title: "Remaining order balance",
    text: "The order must still have refundable balance after prior refunds.",
    category: "Order eligibility",
  },
  {
    code: "SINGLE_QUANTITY_ONLY",
    title: "Single-quantity requests",
    text: "When enabled, refund requests are limited to one unit per submission.",
    category: "Order eligibility",
    defaultConfig: { maxQuantity: 1 },
  },
  {
    code: "ORDER_CURRENCY_USD",
    title: "USD orders only",
    text: "Automated refunds are supported only for USD-denominated orders.",
    category: "Order eligibility",
  },
  {
    code: "ORDER_HAS_DELIVERY_DATE",
    title: "Delivery date recorded",
    text: "The order must have a recorded delivery timestamp.",
    category: "Order eligibility",
  },

  // Time windows (7)
  {
    code: "WITHIN_WINDOW",
    title: "Refund window",
    text: "A refund request must be submitted within the active policy return window after delivery.",
    category: "Time windows",
  },
  {
    code: "MIN_DAYS_AFTER_DELIVERY",
    title: "Minimum days after delivery",
    text: "Refund requests must be submitted at least the configured number of days after delivery.",
    category: "Time windows",
    defaultConfig: { minDays: 0 },
  },
  {
    code: "NOT_BEFORE_DELIVERY",
    title: "Not before delivery",
    text: "Refund requests cannot be submitted before the order delivery timestamp.",
    category: "Time windows",
  },
  {
    code: "NOT_BEFORE_ORDER_PLACED",
    title: "Not before order placed",
    text: "Refund requests cannot be submitted before the order was placed.",
    category: "Time windows",
  },
  {
    code: "EXTENDED_WINDOW_DAMAGED",
    title: "Extended window for damaged items",
    text: "Damaged-item claims receive additional days beyond the standard refund window.",
    category: "Time windows",
    defaultConfig: { extraDays: 14 },
  },
  {
    code: "LATE_DELIVERY_BONUS_WINDOW",
    title: "Late delivery bonus window",
    text: "Late-delivery claims receive additional days beyond the standard refund window.",
    category: "Time windows",
    defaultConfig: { bonusDays: 7 },
  },
  {
    code: "WEEKEND_DELIVERY_GRACE",
    title: "Weekend delivery grace",
    text: "Orders delivered on a weekend receive extra calendar days in the refund window.",
    category: "Time windows",
    defaultConfig: { extraDays: 2 },
  },

  // Item & product (8)
  {
    code: "ITEM_REFUNDABLE",
    title: "Refundable item",
    text: "Items explicitly marked non-refundable are never eligible.",
    category: "Item & product",
  },
  {
    code: "NOT_FINAL_SALE",
    title: "No final-sale refunds",
    text: "Final-sale merchandise cannot be refunded.",
    category: "Item & product",
  },
  {
    code: "VALID_QUANTITY",
    title: "Valid quantity",
    text: "The requested refund quantity must be at least one and cannot exceed the remaining unrefunded purchased quantity.",
    category: "Item & product",
  },
  {
    code: "ITEM_EXISTS_IN_ORDER",
    title: "Item exists on order",
    text: "The requested item must exist on the order line items.",
    category: "Item & product",
  },
  {
    code: "MIN_ITEM_VALUE_CENTS",
    title: "Minimum item value",
    text: "The line-item refund amount must meet the configured minimum value in cents.",
    category: "Item & product",
    defaultConfig: { minCents: 0 },
  },
  {
    code: "MAX_ITEM_VALUE_CENTS",
    title: "Maximum item value",
    text: "The line-item refund amount must not exceed the configured maximum value in cents.",
    category: "Item & product",
    defaultConfig: { maxCents: 500_000 },
  },
  {
    code: "SKU_NOT_EXCLUDED",
    title: "SKU not excluded",
    text: "Items whose SKU appears in the exclusion list are ineligible.",
    category: "Item & product",
    defaultConfig: { excludedSkus: [] as string[] },
  },
  {
    code: "MIN_UNIT_PRICE_CENTS",
    title: "Minimum unit price",
    text: "The item unit price must meet the configured minimum in cents.",
    category: "Item & product",
    defaultConfig: { minCents: 0 },
  },

  // Refund reasons (7)
  {
    code: "REASON_CHANGED_MIND_ALLOWED",
    title: "Changed-mind reason allowed",
    text: "Changed-mind refund requests are permitted when this check is enabled.",
    category: "Refund reasons",
  },
  {
    code: "REASON_DAMAGED_ALLOWED",
    title: "Damaged reason allowed",
    text: "Damaged-item refund requests are permitted when this check is enabled.",
    category: "Refund reasons",
  },
  {
    code: "REASON_WRONG_ITEM_ALLOWED",
    title: "Wrong-item reason allowed",
    text: "Wrong-item refund requests are permitted when this check is enabled.",
    category: "Refund reasons",
  },
  {
    code: "REASON_NOT_AS_DESCRIBED_ALLOWED",
    title: "Not-as-described reason allowed",
    text: "Not-as-described refund requests are permitted when this check is enabled.",
    category: "Refund reasons",
  },
  {
    code: "REASON_LATE_DELIVERY_ALLOWED",
    title: "Late-delivery reason allowed",
    text: "Late-delivery refund requests are permitted when this check is enabled.",
    category: "Refund reasons",
  },
  {
    code: "REASON_REQUIRES_DELIVERY",
    title: "Reason requires delivery",
    text: "Quality and fulfillment reasons require a delivered order before refund evaluation.",
    category: "Refund reasons",
    defaultConfig: {
      reasons: ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "LATE_DELIVERY"],
    },
  },
  {
    code: "DAMAGED_REQUIRES_DAMAGED_CONDITION",
    title: "Damaged claims need damaged condition",
    text: "Damaged-item refund reasons must report the item condition as DAMAGED.",
    category: "Refund reasons",
  },

  // Item condition (6)
  {
    code: "CONDITION_ALLOWED",
    title: "Condition requirement",
    text: "Item condition must satisfy the rule for the selected refund reason.",
    category: "Item condition",
    defaultConfig: { allowedConditionsByReason: DEFAULT_CONDITION_ALLOWED },
  },
  {
    code: "CONDITION_DAMAGED_OK",
    title: "Damaged condition for damaged claims",
    text: "Damaged-item claims must use the DAMAGED condition; other conditions are rejected for that reason.",
    category: "Item condition",
  },
  {
    code: "CONDITION_UNOPENED_ONLY_CHANGED_MIND",
    title: "Unopened only for changed mind",
    text: "Changed-mind requests are accepted only when the item is UNOPENED.",
    category: "Item condition",
  },
  {
    code: "CONDITION_USED_BLOCKED",
    title: "Used condition blocked",
    text: "Items reported as USED are not eligible for automated refunds.",
    category: "Item condition",
  },
  {
    code: "CONDITION_OPENED_ALLOWED_DAMAGED",
    title: "Opened allowed for damaged claims",
    text: "Damaged-item claims may report OPENED or DAMAGED condition.",
    category: "Item condition",
  },
  {
    code: "CONDITION_NOT_USED_FOR_CHANGED_MIND",
    title: "No used items for changed mind",
    text: "Changed-mind requests cannot use the USED condition.",
    category: "Item condition",
  },

  // Amount limits (6)
  {
    code: "REMAINING_BALANCE",
    title: "No over-refunding",
    text: "The item refund cannot make cumulative refunds exceed the order amount paid. Shipping is excluded from automated refunds.",
    category: "Amount limits",
  },
  {
    code: "MAX_REFUND_AMOUNT_CENTS",
    title: "Maximum refund amount",
    text: "A single automated refund cannot exceed the configured maximum amount in cents.",
    category: "Amount limits",
    defaultConfig: { maxCents: 250_000 },
  },
  {
    code: "MIN_REFUND_AMOUNT_CENTS",
    title: "Minimum refund amount",
    text: "A single automated refund must meet the configured minimum amount in cents.",
    category: "Amount limits",
    defaultConfig: { minCents: 0 },
  },
  {
    code: "NO_PARTIAL_BELOW_MIN",
    title: "No partial below minimum",
    text: "Partial-quantity refunds that fall below the minimum refund amount are rejected.",
    category: "Amount limits",
    defaultConfig: { minCents: 100 },
  },
  {
    code: "MAX_ORDER_REFUND_PERCENT",
    title: "Maximum order refund percent",
    text: "Total refunded amount on the order cannot exceed the configured percentage of amount paid.",
    category: "Amount limits",
    defaultConfig: { maxPercent: 100 },
  },
  {
    code: "SHIPPING_NON_REFUNDABLE",
    title: "Shipping non-refundable",
    text: "Automated item refunds cannot include shipping charges from the order total.",
    category: "Amount limits",
  },
];

export type RefundPolicyRuleCode = (typeof POLICY_CATALOG)[number]["code"];

export const POLICY_RULE_CODES = POLICY_CATALOG.map((entry) => entry.code) as RefundPolicyRuleCode[];

export const CORE_POLICY_RULE_CODES: RefundPolicyRuleCode[] = [
  "ACCOUNT_ACTIVE",
  "RISK_NOT_HIGH",
  "ORDER_OWNERSHIP",
  "ORDER_DELIVERED",
  "WITHIN_WINDOW",
  "ITEM_REFUNDABLE",
  "NOT_FINAL_SALE",
  "VALID_QUANTITY",
  "CONDITION_ALLOWED",
  "REMAINING_BALANCE",
];

if (POLICY_CATALOG.length !== 50) {
  throw new Error(`Policy catalog must contain exactly 50 rules; found ${POLICY_CATALOG.length}.`);
}

export function catalogEntry(code: RefundPolicyRuleCode): PolicyCatalogEntry {
  const entry = POLICY_CATALOG.find((candidate) => candidate.code === code);
  if (!entry) throw new Error(`Unknown policy rule code: ${code}`);
  return entry;
}

export function catalogRuleTemplates(options?: { enableCore?: boolean }): CatalogRuleTemplate[] {
  const enableCore = options?.enableCore ?? false;
  return POLICY_CATALOG.map((entry) => ({
    code: entry.code as RefundPolicyRuleCode,
    title: entry.title,
    text: entry.text,
    enabled: entry.code === "CONDITION_ALLOWED" || (enableCore && CORE_POLICY_RULE_CODES.includes(entry.code as RefundPolicyRuleCode)),
    config: entry.defaultConfig
      ? JSON.parse(JSON.stringify(entry.defaultConfig)) as Record<string, unknown>
      : undefined,
  }));
}

export function catalogRulesByCategory(): Record<PolicyRuleCategory, PolicyCatalogEntry[]> {
  return POLICY_RULE_CATEGORIES.reduce((groups, category) => {
    groups[category] = POLICY_CATALOG.filter((entry) => entry.category === category);
    return groups;
  }, {} as Record<PolicyRuleCategory, PolicyCatalogEntry[]>);
}

/** Ensure every catalog rule is present; keep saved enabled state and config. */
export function mergePolicyRulesWithCatalog(existing: CatalogRuleTemplate[]): CatalogRuleTemplate[] {
  const saved = new Map(existing.map((rule) => [rule.code, rule]));
  return catalogRuleTemplates().map((template) => {
    const current = saved.get(template.code);
    if (!current) return template;
    return {
      ...template,
      ...current,
      title: current.title || template.title,
      text: current.text || template.text,
      config: current.config ?? template.config,
    };
  });
}

export function policyRulesNeedCatalogBackfill(existing: CatalogRuleTemplate[]) {
  if (existing.length !== POLICY_CATALOG.length) return true;
  const codes = new Set(existing.map((rule) => rule.code));
  return POLICY_CATALOG.some((entry) => !codes.has(entry.code as RefundPolicyRuleCode));
}
