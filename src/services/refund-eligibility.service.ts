import {
  enabledRuleCodes,
  type RefundPolicyDefinition,
} from "@/domain/refunds/policy";
import { evaluateRule } from "@/domain/refunds/policy-evaluators";
import type { Customer, Order, RefundEvaluation, RefundRequest, RuleCheck } from "@/domain/refunds/types";
import { differenceInCalendarDays } from "@/lib/date";

function check(code: string, passed: boolean, summary: string, evidence: RuleCheck["evidence"]): RuleCheck {
  return { code, passed, summary, evidence };
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
  if (policy.rules.length === 0 || activeRules.size === 0) {
    return {
      decision: "DENY",
      refundAmountCents: 0,
      checks: [check("POLICY_CONFIGURED", false, "At least one refund rule must be enabled.", { enabledRuleCount: activeRules.size })],
      denialReasons: ["POLICY_CONFIGURED: At least one refund rule must be enabled."],
    };
  }
  const alreadyRefundedItemQuantity = Math.max(0, context.alreadyRefundedItemQuantity ?? 0);
  const remainingItemQuantity = item ? Math.max(0, item.quantity - alreadyRefundedItemQuantity) : 0;
  const itemRefundCents = item ? item.unitPriceCents * request.quantity : 0;
  const remainingOrderBalanceCents = Math.max(0, order.totalPaidCents - order.refundedCents);

  const checks: RuleCheck[] = [];

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;
    const result = evaluateRule(rule.code, {
      customer,
      order,
      request,
      policy,
      rule,
      item,
      daysSinceDelivery,
      alreadyRefundedItemQuantity,
      remainingItemQuantity,
      itemRefundCents,
      remainingOrderBalanceCents,
    });
    checks.push(check(rule.code, result.passed, result.summary, result.evidence));
  }

  const failedChecks = checks.filter((rule) => !rule.passed);
  return {
    decision: failedChecks.length === 0 ? "APPROVE" : "DENY",
    refundAmountCents: failedChecks.length === 0 ? itemRefundCents : 0,
    checks,
    denialReasons: failedChecks.map((rule) => `${rule.code}: ${rule.summary}`),
  };
}
