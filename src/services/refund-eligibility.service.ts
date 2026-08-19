import { REFUND_POLICY, type RefundPolicyDefinition } from "@/domain/refunds/policy";
import type { Customer, Order, RefundEvaluation, RefundRequest, RuleCheck } from "@/domain/refunds/types";
import { differenceInCalendarDays } from "@/lib/date";

function check(code: string, passed: boolean, summary: string, evidence: RuleCheck["evidence"]): RuleCheck {
  return { code, passed, summary, evidence };
}

function conditionIsAllowed(request: RefundRequest): boolean {
  if (["CHANGED_MIND", "LATE_DELIVERY", "NOT_AS_DESCRIBED"].includes(request.reason)) {
    return request.condition === "UNOPENED";
  }
  if (["DAMAGED", "WRONG_ITEM"].includes(request.reason)) {
    return request.condition !== "USED";
  }
  return false;
}

export interface RefundEvaluationContext {
  alreadyRefundedItemQuantity?: number;
  policy?: RefundPolicyDefinition;
}

export function evaluateRefundEligibility(
  customer: Customer,
  order: Order,
  request: RefundRequest,
  context: RefundEvaluationContext = {},
): RefundEvaluation {
  const item = order.items.find((candidate) => candidate.id === request.itemId);
  const daysSinceDelivery = order.deliveredAt
    ? differenceInCalendarDays(request.requestedAt, order.deliveredAt)
    : null;
  const policy = context.policy ?? REFUND_POLICY;
  const alreadyRefundedItemQuantity = Math.max(0, context.alreadyRefundedItemQuantity ?? 0);
  const remainingItemQuantity = item ? Math.max(0, item.quantity - alreadyRefundedItemQuantity) : 0;
  const itemRefundCents = item ? item.unitPriceCents * request.quantity : 0;
  const remainingOrderBalanceCents = Math.max(0, order.totalPaidCents - order.refundedCents);

  const checks: RuleCheck[] = [
    check("ACCOUNT_ACTIVE", customer.accountStatus === "ACTIVE", "Customer account must be active.", { accountStatus: customer.accountStatus }),
    check("RISK_NOT_HIGH", customer.riskLevel !== "HIGH", "High-risk accounts require a human workflow and are denied by the automated path.", { riskLevel: customer.riskLevel }),
    check("ORDER_OWNERSHIP", order.customerId === customer.id && request.customerId === customer.id, "Customer must own the order.", { orderCustomerId: order.customerId, requestCustomerId: request.customerId }),
    check("ORDER_DELIVERED", order.status === "DELIVERED" && Boolean(order.deliveredAt), "Order must be delivered before refund evaluation.", { orderStatus: order.status, deliveredAt: order.deliveredAt }),
    check("WITHIN_WINDOW", daysSinceDelivery !== null && daysSinceDelivery >= 0 && daysSinceDelivery <= policy.refundWindowDays, `Request must be within ${policy.refundWindowDays} days of delivery.`, { daysSinceDelivery, allowedDays: policy.refundWindowDays }),
    check("ITEM_REFUNDABLE", Boolean(item?.refundable), "Item must be explicitly refundable.", { itemFound: Boolean(item), refundable: item?.refundable ?? false }),
    check("NOT_FINAL_SALE", item !== undefined && item.finalSale === false, "Final-sale items cannot be refunded.", { finalSale: item?.finalSale ?? null }),
    check("VALID_QUANTITY", item !== undefined && Number.isInteger(request.quantity) && request.quantity >= 1 && request.quantity <= remainingItemQuantity, "Refund quantity must not exceed the remaining unrefunded purchased quantity.", { requestedQuantity: request.quantity, purchasedQuantity: item?.quantity ?? 0, alreadyRefundedItemQuantity, remainingItemQuantity }),
    check("CONDITION_ALLOWED", conditionIsAllowed(request), "Item condition must satisfy the rule for the selected refund reason.", { reason: request.reason, condition: request.condition }),
    check("REMAINING_BALANCE", itemRefundCents > 0 && itemRefundCents <= remainingOrderBalanceCents, "Refund cannot exceed the remaining paid balance.", { requestedRefundCents: itemRefundCents, remainingOrderBalanceCents }),
  ];

  const failedChecks = checks.filter((rule) => !rule.passed);
  return {
    decision: failedChecks.length === 0 ? "APPROVE" : "DENY",
    refundAmountCents: failedChecks.length === 0 ? itemRefundCents : 0,
    checks,
    denialReasons: failedChecks.map((rule) => `${rule.code}: ${rule.summary}`),
  };
}
