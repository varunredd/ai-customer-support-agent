import { REFUND_POLICY } from "@/domain/refunds/policy";
import type { RefundRequest } from "@/domain/refunds/types";
import { customerRepository, orderRepository } from "@/repositories/in-memory";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";

export async function lookupCustomerByEmail(email: string) {
  return customerRepository.findByEmail(email);
}

export async function lookupOrder(orderId: string, customerId: string) {
  return orderRepository.findForCustomer(orderId, customerId);
}

export async function getRefundPolicy() {
  return REFUND_POLICY;
}

export async function validateRefundRequest(request: RefundRequest) {
  const customer = await customerRepository.findById(request.customerId);
  const order = await orderRepository.findById(request.orderId);

  if (!customer) {
    return { decision: "DENY" as const, refundAmountCents: 0, checks: [], denialReasons: ["CUSTOMER_NOT_FOUND: Customer does not exist."] };
  }
  if (!order) {
    return { decision: "DENY" as const, refundAmountCents: 0, checks: [], denialReasons: ["ORDER_NOT_FOUND: Order does not exist."] };
  }

  return evaluateRefundEligibility(customer, order, request);
}
