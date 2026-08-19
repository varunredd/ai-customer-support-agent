import type { ExecuteRefundInput } from "@/domain/refunds/execution";
import type { RefundRequest } from "@/domain/refunds/types";
import { getApplicationRepositories } from "@/repositories";
import { RefundPolicyNotFoundError, RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";
import { executeRefundAtomically } from "@/services/refund-execution.service";

export async function lookupCustomerByEmail(email: string) {
  const { customerRepository } = getApplicationRepositories();
  return customerRepository.findByEmail(email);
}

export async function lookupOrder(orderId: string, customerId: string) {
  const { orderRepository } = getApplicationRepositories();
  return orderRepository.findForCustomer(orderId, customerId);
}

export async function getRefundPolicy() {
  const { db } = getApplicationRepositories();
  return new RefundPolicyRepository(db).getActive();
}

export async function validateRefundRequest(request: RefundRequest) {
  const { db, customerRepository, orderRepository } = getApplicationRepositories();
  const customer = await customerRepository.findById(request.customerId);
  const order = await orderRepository.findById(request.orderId);

  if (!customer) {
    return { decision: "DENY" as const, refundAmountCents: 0, checks: [], denialReasons: ["CUSTOMER_NOT_FOUND: Customer does not exist."] };
  }
  if (!order) {
    return { decision: "DENY" as const, refundAmountCents: 0, checks: [], denialReasons: ["ORDER_NOT_FOUND: Order does not exist."] };
  }

  let policy;
  try {
    policy = new RefundPolicyRepository(db).getActive();
  } catch (error) {
    if (error instanceof RefundPolicyNotFoundError) {
      return {
        decision: "DENY" as const,
        refundAmountCents: 0,
        checks: [],
        denialReasons: ["POLICY_NOT_PUBLISHED: No active refund policy is published."],
        policyVersion: null,
      };
    }
    throw error;
  }

  const refunded = db
    .prepare("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM refunds WHERE item_id = ?")
    .get(request.itemId) as { quantity: number };

  const evaluation = evaluateRefundEligibility(customer, order, request, {
    alreadyRefundedItemQuantity: refunded.quantity,
    policy,
  });
  return { ...evaluation, policyVersion: policy.version };
}

export async function executeRefund(input: ExecuteRefundInput) {
  const { db } = getApplicationRepositories();
  return executeRefundAtomically(db, input);
}
