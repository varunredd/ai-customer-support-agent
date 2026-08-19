import { differenceInCalendarDays } from "@/lib/date";
import { conditionAllowedConfig, type RefundPolicyDefinition, type RefundPolicyRule } from "@/domain/refunds/policy";
import type { RefundPolicyRuleCode } from "@/domain/refunds/policy-catalog";
import type { Customer, Order, RefundRequest, RuleCheck } from "@/domain/refunds/types";

export interface RuleEvalContext {
  customer: Customer;
  order: Order;
  request: RefundRequest;
  policy: RefundPolicyDefinition;
  rule: RefundPolicyRule;
  item: Order["items"][number] | undefined;
  daysSinceDelivery: number | null;
  alreadyRefundedItemQuantity: number;
  remainingItemQuantity: number;
  itemRefundCents: number;
  remainingOrderBalanceCents: number;
}

export type RuleEvalResult = Pick<RuleCheck, "passed" | "summary" | "evidence">;

export type RuleEvaluator = (context: RuleEvalContext) => RuleEvalResult;

function configNumber(rule: RefundPolicyRule, key: string, fallback: number): number {
  const value = rule.config?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function configBoolean(rule: RefundPolicyRule, key: string, fallback: boolean): boolean {
  const value = rule.config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function configStringArray(rule: RefundPolicyRule, key: string): string[] {
  const value = rule.config?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function accountAgeDays(customer: Customer, requestedAt: string): number {
  return differenceInCalendarDays(requestedAt, customer.createdAt);
}

function effectiveRefundWindowDays(context: RuleEvalContext): number {
  let windowDays = context.policy.refundWindowDays;
  if (context.request.reason === "DAMAGED") {
    const damagedRule = context.policy.rules.find((entry) => entry.code === "EXTENDED_WINDOW_DAMAGED" && entry.enabled);
    if (damagedRule) windowDays += configNumber(damagedRule, "extraDays", 14);
  }
  if (context.request.reason === "LATE_DELIVERY") {
    const lateRule = context.policy.rules.find((entry) => entry.code === "LATE_DELIVERY_BONUS_WINDOW" && entry.enabled);
    if (lateRule) windowDays += configNumber(lateRule, "bonusDays", 7);
  }
  if (context.order.deliveredAt) {
    const weekendRule = context.policy.rules.find((entry) => entry.code === "WEEKEND_DELIVERY_GRACE" && entry.enabled);
    if (weekendRule) {
      const day = new Date(context.order.deliveredAt).getUTCDay();
      if (day === 0 || day === 6) windowDays += configNumber(weekendRule, "extraDays", 2);
    }
  }
  return windowDays;
}

const RULE_EVALUATORS: Record<RefundPolicyRuleCode, RuleEvaluator> = {
  ACCOUNT_ACTIVE: ({ customer }) => ({
    passed: customer.accountStatus === "ACTIVE",
    summary: "Customer account must be active.",
    evidence: { accountStatus: customer.accountStatus },
  }),

  RISK_NOT_HIGH: ({ customer }) => ({
    passed: customer.riskLevel !== "HIGH",
    summary: "High-risk accounts require a human workflow and are denied by the automated path.",
    evidence: { riskLevel: customer.riskLevel },
  }),

  MIN_ACCOUNT_AGE_DAYS: ({ customer, request, rule }) => {
    const minDays = configNumber(rule, "minDays", 0);
    const ageDays = accountAgeDays(customer, request.requestedAt);
    return {
      passed: ageDays >= minDays,
      summary: `Customer account must be at least ${minDays} days old.`,
      evidence: { accountAgeDays: ageDays, minDays },
    };
  },

  MAX_LIFETIME_REFUNDS: ({ customer, rule }) => {
    const maxRefunds = configNumber(rule, "maxRefunds", 15);
    return {
      passed: customer.lifetimeRefunds < maxRefunds,
      summary: `Customer lifetime refunds must stay below ${maxRefunds}.`,
      evidence: { lifetimeRefunds: customer.lifetimeRefunds, maxRefunds },
    };
  },

  REFUND_TO_ORDER_RATIO: ({ customer, rule }) => {
    const maxRatio = configNumber(rule, "maxRatio", 0.75);
    const ratio = customer.lifetimeOrders === 0 ? 0 : customer.lifetimeRefunds / customer.lifetimeOrders;
    return {
      passed: customer.lifetimeOrders === 0 || ratio <= maxRatio,
      summary: `Refund-to-order ratio must be at most ${maxRatio}.`,
      evidence: { lifetimeOrders: customer.lifetimeOrders, lifetimeRefunds: customer.lifetimeRefunds, ratio, maxRatio },
    };
  },

  NEW_CUSTOMER_MIN_ORDERS: ({ customer, rule }) => {
    const minOrders = configNumber(rule, "minOrders", 0);
    return {
      passed: customer.lifetimeOrders >= minOrders,
      summary: `Customer must have at least ${minOrders} completed orders.`,
      evidence: { lifetimeOrders: customer.lifetimeOrders, minOrders },
    };
  },

  MEDIUM_RISK_ALLOWED: ({ customer, rule }) => {
    const allowMedium = configBoolean(rule, "allowMedium", true);
    const passed = customer.riskLevel === "LOW" || (allowMedium && customer.riskLevel === "MEDIUM");
    return {
      passed,
      summary: allowMedium
        ? "Only LOW and MEDIUM risk customers are eligible."
        : "Only LOW risk customers are eligible.",
      evidence: { riskLevel: customer.riskLevel, allowMedium },
    };
  },

  MIN_LIFETIME_ORDERS: ({ customer, rule }) => {
    const minOrders = configNumber(rule, "minOrders", 1);
    return {
      passed: customer.lifetimeOrders >= minOrders,
      summary: `Customer must have at least ${minOrders} lifetime orders.`,
      evidence: { lifetimeOrders: customer.lifetimeOrders, minOrders },
    };
  },

  ORDER_OWNERSHIP: ({ customer, order, request }) => ({
    passed: order.customerId === customer.id && request.customerId === customer.id,
    summary: "Customer must own the order.",
    evidence: { orderCustomerId: order.customerId, requestCustomerId: request.customerId },
  }),

  ORDER_DELIVERED: ({ order }) => ({
    passed: order.status === "DELIVERED" && Boolean(order.deliveredAt),
    summary: "Order must be delivered before refund evaluation.",
    evidence: { orderStatus: order.status, deliveredAt: order.deliveredAt },
  }),

  ORDER_NOT_CANCELLED: ({ order }) => ({
    passed: order.status !== "CANCELLED",
    summary: "Cancelled orders cannot receive refunds.",
    evidence: { orderStatus: order.status },
  }),

  ORDER_FULLY_PAID: ({ order }) => ({
    passed: order.totalPaidCents > 0,
    summary: "Order must have a positive paid amount.",
    evidence: { totalPaidCents: order.totalPaidCents },
  }),

  ORDER_HAS_REMAINING_BALANCE: ({ remainingOrderBalanceCents }) => ({
    passed: remainingOrderBalanceCents > 0,
    summary: "Order must have remaining refundable balance.",
    evidence: { remainingOrderBalanceCents },
  }),

  SINGLE_QUANTITY_ONLY: ({ request, rule }) => {
    const maxQuantity = configNumber(rule, "maxQuantity", 1);
    return {
      passed: request.quantity <= maxQuantity,
      summary: `Refund quantity must not exceed ${maxQuantity} per request.`,
      evidence: { requestedQuantity: request.quantity, maxQuantity },
    };
  },

  ORDER_CURRENCY_USD: ({ order }) => ({
    passed: order.currency === "USD",
    summary: "Only USD orders are eligible for automated refunds.",
    evidence: { currency: order.currency },
  }),

  ORDER_HAS_DELIVERY_DATE: ({ order }) => ({
    passed: Boolean(order.deliveredAt),
    summary: "Order must have a recorded delivery date.",
    evidence: { deliveredAt: order.deliveredAt },
  }),

  WITHIN_WINDOW: (context) => {
    const allowedDays = effectiveRefundWindowDays(context);
    const { daysSinceDelivery } = context;
    return {
      passed: daysSinceDelivery !== null && daysSinceDelivery >= 0 && daysSinceDelivery <= allowedDays,
      summary: `Request must be within ${allowedDays} days of delivery.`,
      evidence: { daysSinceDelivery, allowedDays },
    };
  },

  MIN_DAYS_AFTER_DELIVERY: ({ daysSinceDelivery, rule }) => {
    const minDays = configNumber(rule, "minDays", 0);
    return {
      passed: daysSinceDelivery !== null && daysSinceDelivery >= minDays,
      summary: `Request must be at least ${minDays} days after delivery.`,
      evidence: { daysSinceDelivery, minDays },
    };
  },

  NOT_BEFORE_DELIVERY: ({ order, request }) => {
    const passed = !order.deliveredAt || request.requestedAt >= order.deliveredAt;
    return {
      passed,
      summary: "Refund request cannot be submitted before delivery.",
      evidence: { requestedAt: request.requestedAt, deliveredAt: order.deliveredAt },
    };
  },

  NOT_BEFORE_ORDER_PLACED: ({ order, request }) => ({
    passed: request.requestedAt >= order.placedAt,
    summary: "Refund request cannot be submitted before the order was placed.",
    evidence: { requestedAt: request.requestedAt, placedAt: order.placedAt },
  }),

  EXTENDED_WINDOW_DAMAGED: () => ({
    passed: true,
    summary: "Extended damaged-item window is applied through the refund window check.",
    evidence: { appliedWithWithinWindow: true },
  }),

  LATE_DELIVERY_BONUS_WINDOW: () => ({
    passed: true,
    summary: "Late-delivery bonus window is applied through the refund window check.",
    evidence: { appliedWithWithinWindow: true },
  }),

  WEEKEND_DELIVERY_GRACE: () => ({
    passed: true,
    summary: "Weekend delivery grace is applied through the refund window check.",
    evidence: { appliedWithWithinWindow: true },
  }),

  ITEM_REFUNDABLE: ({ item }) => ({
    passed: Boolean(item?.refundable),
    summary: "Item must be explicitly refundable.",
    evidence: { itemFound: Boolean(item), refundable: item?.refundable ?? false },
  }),

  NOT_FINAL_SALE: ({ item }) => ({
    passed: item !== undefined && item.finalSale === false,
    summary: "Final-sale items cannot be refunded.",
    evidence: { finalSale: item?.finalSale ?? null },
  }),

  VALID_QUANTITY: ({ item, request, alreadyRefundedItemQuantity, remainingItemQuantity }) => ({
    passed: item !== undefined
      && Number.isInteger(request.quantity)
      && request.quantity >= 1
      && request.quantity <= remainingItemQuantity,
    summary: "Refund quantity must not exceed the remaining unrefunded purchased quantity.",
    evidence: {
      requestedQuantity: request.quantity,
      purchasedQuantity: item?.quantity ?? 0,
      alreadyRefundedItemQuantity,
      remainingItemQuantity,
    },
  }),

  ITEM_EXISTS_IN_ORDER: ({ item }) => ({
    passed: Boolean(item),
    summary: "Requested item must exist on the order.",
    evidence: { itemFound: Boolean(item) },
  }),

  MIN_ITEM_VALUE_CENTS: ({ itemRefundCents, rule }) => {
    const minCents = configNumber(rule, "minCents", 0);
    return {
      passed: itemRefundCents >= minCents,
      summary: `Line-item refund must be at least ${minCents} cents.`,
      evidence: { itemRefundCents, minCents },
    };
  },

  MAX_ITEM_VALUE_CENTS: ({ itemRefundCents, rule }) => {
    const maxCents = configNumber(rule, "maxCents", 500_000);
    return {
      passed: itemRefundCents <= maxCents,
      summary: `Line-item refund must not exceed ${maxCents} cents.`,
      evidence: { itemRefundCents, maxCents },
    };
  },

  SKU_NOT_EXCLUDED: ({ item, rule }) => {
    const excludedSkus = configStringArray(rule, "excludedSkus");
    const sku = item?.sku ?? "";
    return {
      passed: !excludedSkus.includes(sku),
      summary: "Item SKU must not be on the exclusion list.",
      evidence: { sku, excludedSkus: excludedSkus.join(",") || null },
    };
  },

  MIN_UNIT_PRICE_CENTS: ({ item, rule }) => {
    const minCents = configNumber(rule, "minCents", 0);
    const unitPriceCents = item?.unitPriceCents ?? 0;
    return {
      passed: unitPriceCents >= minCents,
      summary: `Item unit price must be at least ${minCents} cents.`,
      evidence: { unitPriceCents, minCents },
    };
  },

  REASON_CHANGED_MIND_ALLOWED: ({ request, rule }): RuleEvalResult => {
    if (request.reason !== "CHANGED_MIND") {
      return { passed: true, summary: "Changed-mind gate does not apply to this reason.", evidence: { reason: request.reason, applies: false } };
    }
    const allowed = configBoolean(rule, "allowed", true);
    return {
      passed: allowed,
      summary: allowed ? "Changed-mind refund reason is allowed." : "Changed-mind refunds are blocked by policy.",
      evidence: { reason: request.reason, applies: true, allowed },
    };
  },

  REASON_DAMAGED_ALLOWED: ({ request, rule }): RuleEvalResult => {
    if (request.reason !== "DAMAGED") {
      return { passed: true, summary: "Damaged gate does not apply to this reason.", evidence: { reason: request.reason, applies: false } };
    }
    const allowed = configBoolean(rule, "allowed", true);
    return {
      passed: allowed,
      summary: allowed ? "Damaged refund reason is allowed." : "Damaged refunds are blocked by policy.",
      evidence: { reason: request.reason, applies: true, allowed },
    };
  },

  REASON_WRONG_ITEM_ALLOWED: ({ request, rule }): RuleEvalResult => {
    if (request.reason !== "WRONG_ITEM") {
      return { passed: true, summary: "Wrong-item gate does not apply to this reason.", evidence: { reason: request.reason, applies: false } };
    }
    const allowed = configBoolean(rule, "allowed", true);
    return {
      passed: allowed,
      summary: allowed ? "Wrong-item refund reason is allowed." : "Wrong-item refunds are blocked by policy.",
      evidence: { reason: request.reason, applies: true, allowed },
    };
  },

  REASON_NOT_AS_DESCRIBED_ALLOWED: ({ request, rule }): RuleEvalResult => {
    if (request.reason !== "NOT_AS_DESCRIBED") {
      return { passed: true, summary: "Not-as-described gate does not apply to this reason.", evidence: { reason: request.reason, applies: false } };
    }
    const allowed = configBoolean(rule, "allowed", true);
    return {
      passed: allowed,
      summary: allowed ? "Not-as-described refund reason is allowed." : "Not-as-described refunds are blocked by policy.",
      evidence: { reason: request.reason, applies: true, allowed },
    };
  },

  REASON_LATE_DELIVERY_ALLOWED: ({ request, rule }): RuleEvalResult => {
    if (request.reason !== "LATE_DELIVERY") {
      return { passed: true, summary: "Late-delivery gate does not apply to this reason.", evidence: { reason: request.reason, applies: false } };
    }
    const allowed = configBoolean(rule, "allowed", true);
    return {
      passed: allowed,
      summary: allowed ? "Late-delivery refund reason is allowed." : "Late-delivery refunds are blocked by policy.",
      evidence: { reason: request.reason, applies: true, allowed },
    };
  },

  REASON_REQUIRES_DELIVERY: ({ order, request, rule }) => {
    const reasons = configStringArray(rule, "reasons");
    const requiresDelivery = reasons.length > 0
      ? reasons.includes(request.reason)
      : ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "LATE_DELIVERY"].includes(request.reason);
    const passed = !requiresDelivery || (order.status === "DELIVERED" && Boolean(order.deliveredAt));
    return {
      passed,
      summary: "Selected refund reason requires a delivered order.",
      evidence: { reason: request.reason, orderStatus: order.status, deliveredAt: order.deliveredAt },
    };
  },

  DAMAGED_REQUIRES_DAMAGED_CONDITION: ({ request }) => ({
    passed: request.reason !== "DAMAGED" || request.condition === "DAMAGED",
    summary: "Damaged-item claims must report condition as DAMAGED.",
    evidence: { reason: request.reason, condition: request.condition },
  }),

  CONDITION_ALLOWED: ({ request, policy }) => {
    const allowedByReason = conditionAllowedConfig(policy);
    const allowed = allowedByReason[request.reason];
    const passed = Boolean(allowed?.includes(request.condition));
    return {
      passed,
      summary: "Item condition must satisfy the rule for the selected refund reason.",
      evidence: { reason: request.reason, condition: request.condition },
    };
  },

  CONDITION_DAMAGED_OK: ({ request }) => ({
    passed: request.reason !== "DAMAGED" || request.condition === "DAMAGED",
    summary: "Damaged-item claims must use the DAMAGED condition.",
    evidence: { reason: request.reason, condition: request.condition },
  }),

  CONDITION_UNOPENED_ONLY_CHANGED_MIND: ({ request }) => ({
    passed: request.reason !== "CHANGED_MIND" || request.condition === "UNOPENED",
    summary: "Changed-mind requests require UNOPENED condition.",
    evidence: { reason: request.reason, condition: request.condition },
  }),

  CONDITION_USED_BLOCKED: ({ request }) => ({
    passed: request.condition !== "USED",
    summary: "USED condition is not eligible for automated refunds.",
    evidence: { condition: request.condition },
  }),

  CONDITION_OPENED_ALLOWED_DAMAGED: ({ request }) => ({
    passed: request.reason !== "DAMAGED" || request.condition === "OPENED" || request.condition === "DAMAGED",
    summary: "Damaged claims allow OPENED or DAMAGED condition.",
    evidence: { reason: request.reason, condition: request.condition },
  }),

  CONDITION_NOT_USED_FOR_CHANGED_MIND: ({ request }) => ({
    passed: request.reason !== "CHANGED_MIND" || request.condition !== "USED",
    summary: "Changed-mind requests cannot use USED condition.",
    evidence: { reason: request.reason, condition: request.condition },
  }),

  REMAINING_BALANCE: ({ itemRefundCents, remainingOrderBalanceCents }) => ({
    passed: itemRefundCents > 0 && itemRefundCents <= remainingOrderBalanceCents,
    summary: "Refund cannot exceed the remaining paid balance.",
    evidence: { requestedRefundCents: itemRefundCents, remainingOrderBalanceCents },
  }),

  MAX_REFUND_AMOUNT_CENTS: ({ itemRefundCents, rule }) => {
    const maxCents = configNumber(rule, "maxCents", 250_000);
    return {
      passed: itemRefundCents <= maxCents,
      summary: `Refund amount must not exceed ${maxCents} cents.`,
      evidence: { itemRefundCents, maxCents },
    };
  },

  MIN_REFUND_AMOUNT_CENTS: ({ itemRefundCents, rule }) => {
    const minCents = configNumber(rule, "minCents", 0);
    return {
      passed: itemRefundCents >= minCents,
      summary: `Refund amount must be at least ${minCents} cents.`,
      evidence: { itemRefundCents, minCents },
    };
  },

  NO_PARTIAL_BELOW_MIN: ({ item, request, itemRefundCents, remainingItemQuantity, rule }) => {
    const minCents = configNumber(rule, "minCents", 100);
    const partialQuantity = item !== undefined && request.quantity < remainingItemQuantity;
    const passed = !partialQuantity || itemRefundCents >= minCents;
    return {
      passed,
      summary: `Partial refunds must be at least ${minCents} cents.`,
      evidence: { itemRefundCents, minCents, partialQuantity },
    };
  },

  MAX_ORDER_REFUND_PERCENT: ({ order, itemRefundCents, rule }) => {
    const maxPercent = configNumber(rule, "maxPercent", 100);
    const projectedTotal = order.refundedCents + itemRefundCents;
    const percent = order.totalPaidCents === 0 ? 0 : (projectedTotal / order.totalPaidCents) * 100;
    return {
      passed: percent <= maxPercent,
      summary: `Total refunded amount must stay within ${maxPercent}% of order paid total.`,
      evidence: { projectedTotal, totalPaidCents: order.totalPaidCents, percent, maxPercent },
    };
  },

  SHIPPING_NON_REFUNDABLE: ({ order, itemRefundCents }) => {
    const merchandiseCap = Math.max(0, order.subtotalCents - order.refundedCents);
    return {
      passed: itemRefundCents <= merchandiseCap,
      summary: "Automated refunds cannot include shipping or tax portions of the order.",
      evidence: { itemRefundCents, merchandiseCap, shippingCents: order.shippingCents },
    };
  },
};

if (Object.keys(RULE_EVALUATORS).length !== 50) {
  throw new Error(`Rule evaluators must cover exactly 50 codes; found ${Object.keys(RULE_EVALUATORS).length}.`);
}

export { RULE_EVALUATORS };

export function evaluateRule(code: RefundPolicyRuleCode, context: RuleEvalContext): RuleEvalResult {
  const evaluator = RULE_EVALUATORS[code];
  if (!evaluator) {
    return {
      passed: false,
      summary: `No evaluator registered for rule ${code}.`,
      evidence: { code },
    };
  }
  return evaluator(context);
}
