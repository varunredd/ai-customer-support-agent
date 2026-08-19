import {
  conditionAllowedConfig,
  enabledRuleCodes,
  type RefundPolicyDefinition,
} from "@/domain/refunds/policy";
import type { Customer, Order, RefundEvaluation, RefundRequest, RuleCheck } from "@/domain/refunds/types";
import { differenceInCalendarDays } from "@/lib/date";

function check(code: string, passed: boolean, summary: string, evidence: RuleCheck["evidence"]): RuleCheck {
  return { code, passed, summary, evidence };
}

function conditionIsAllowed(request: RefundRequest, policy: RefundPolicyDefinition): boolean {
  const allowedByReason = conditionAllowedConfig(policy);
  const allowed = allowedByReason[request.reason];
  if (!allowed || allowed.length === 0) return false;
  return allowed.includes(request.condition);
}

export interface RefundEvaluationContext {
  alreadyRefundedItemQuantity?: number;
  policy: RefundPolicyDefinition;
}

export function evaluateRefundEligibility(
  customer: Customer,
  order: Order,
  request: RefundRequest,
  context: RefundEvaluationContext,
): RefundEvaluation {
  const item = order.items.find((candidate) => candidate.id === request.itemId);
  const daysSinceDelivery = order.deliveredAt
    ? differenceInCalendarDays(request.requestedAt, order.deliveredAt)
    : null;
  const policy = context.policy;
  const activeRules = enabledRuleCodes(policy);
  const alreadyRefundedItemQuantity = Math.max(0, context.alreadyRefundedItemQuantity ?? 0);
  const remainingItemQuantity = item ? Math.max(0, item.quantity - alreadyRefundedItemQuantity) : 0;
  const itemRefundCents = item ? item.unitPriceCents * request.quantity : 0;
  const remainingOrderBalanceCents = Math.max(0, order.totalPaidCents - order.refundedCents);

  const checks: RuleCheck[] = [];

  if (activeRules.has("ACCOUNT_ACTIVE")) {
    checks.push(check("ACCOUNT_ACTIVE", customer.accountStatus === "ACTIVE", "Customer account must be active.", { accountStatus: customer.accountStatus }));
  }
  if (activeRules.has("RISK_NOT_HIGH")) {
    checks.push(check("RISK_NOT_HIGH", customer.riskLevel !== "HIGH", "High-risk accounts require a human workflow and are denied by the automated path.", { riskLevel: customer.riskLevel }));
  }
  if (activeRules.has("ORDER_OWNERSHIP")) {
    checks.push(check("ORDER_OWNERSHIP", order.customerId === customer.id && request.customerId === customer.id, "Customer must own the order.", { orderCustomerId: order.customerId, requestCustomerId: request.customerId }));
  }
  if (activeRules.has("ORDER_DELIVERED")) {
    checks.push(check("ORDER_DELIVERED", order.status === "DELIVERED" && Boolean(order.deliveredAt), "Order must be delivered before refund evaluation.", { orderStatus: order.status, deliveredAt: order.deliveredAt }));
  }
  if (activeRules.has("WITHIN_WINDOW")) {
    checks.push(check("WITHIN_WINDOW", daysSinceDelivery !== null && daysSinceDelivery >= 0 && daysSinceDelivery <= policy.refundWindowDays, `Request must be within ${policy.refundWindowDays} days of delivery.`, { daysSinceDelivery, allowedDays: policy.refundWindowDays }));
  }
  if (activeRules.has("ITEM_REFUNDABLE")) {
    checks.push(check("ITEM_REFUNDABLE", Boolean(item?.refundable), "Item must be explicitly refundable.", { itemFound: Boolean(item), refundable: item?.refundable ?? false }));
  }
  if (activeRules.has("NOT_FINAL_SALE")) {
    checks.push(check("NOT_FINAL_SALE", item !== undefined && item.finalSale === false, "Final-sale items cannot be refunded.", { finalSale: item?.finalSale ?? null }));
  }
  if (activeRules.has("VALID_QUANTITY")) {
    checks.push(check("VALID_QUANTITY", item !== undefined && Number.isInteger(request.quantity) && request.quantity >= 1 && request.quantity <= remainingItemQuantity, "Refund quantity must not exceed the remaining unrefunded purchased quantity.", { requestedQuantity: request.quantity, purchasedQuantity: item?.quantity ?? 0, alreadyRefundedItemQuantity, remainingItemQuantity }));
  }
  if (activeRules.has("CONDITION_ALLOWED")) {
    checks.push(check("CONDITION_ALLOWED", conditionIsAllowed(request, policy), "Item condition must satisfy the rule for the selected refund reason.", { reason: request.reason, condition: request.condition }));
  }
  if (activeRules.has("REMAINING_BALANCE")) {
    checks.push(check("REMAINING_BALANCE", itemRefundCents > 0 && itemRefundCents <= remainingOrderBalanceCents, "Refund cannot exceed the remaining paid balance.", { requestedRefundCents: itemRefundCents, remainingOrderBalanceCents }));
  }

  const failedChecks = checks.filter((rule) => !rule.passed);
  return {
    decision: failedChecks.length === 0 ? "APPROVE" : "DENY",
    refundAmountCents: failedChecks.length === 0 ? itemRefundCents : 0,
    checks,
    denialReasons: failedChecks.map((rule) => `${rule.code}: ${rule.summary}`),
  };
}
