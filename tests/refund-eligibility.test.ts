import assert from "node:assert/strict";
import test from "node:test";
import { customers } from "../src/data/customers";
import { orders } from "../src/data/orders";
import { buildPolicyDefinition } from "../src/domain/refunds/policy";
import { evaluateRefundEligibility } from "../src/services/refund-eligibility.service";
import type { RefundRequest } from "../src/domain/refunds/types";

const testPolicy = buildPolicyDefinition({ version: "test-policy", refundWindowDays: 30, enableCore: true });

const customer = (id: string) => {
  const value = customers.find((entry) => entry.id === id);
  assert.ok(value);
  return value;
};

const order = (id: string) => {
  const value = orders.find((entry) => entry.id === id);
  assert.ok(value);
  return value;
};

function request(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    customerId: "cus_001",
    orderId: "ord_8901",
    itemId: "item_001",
    quantity: 1,
    reason: "CHANGED_MIND",
    condition: "UNOPENED",
    requestedAt: "2026-08-18T10:00:00Z",
    ...overrides,
  };
}

test("approves a standard eligible refund and refunds item price only", () => {
  const result = evaluateRefundEligibility(customer("cus_001"), order("ord_8901"), request(), { policy: testPolicy });
  assert.equal(result.decision, "APPROVE");
  assert.equal(result.refundAmountCents, 8900);
  assert.deepEqual(result.denialReasons, []);
});

test("denies a final-sale item", () => {
  const result = evaluateRefundEligibility(
    customer("cus_002"),
    order("ord_8902"),
    request({ customerId: "cus_002", orderId: "ord_8902", itemId: "item_002" }),
    { policy: testPolicy },
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.denialReasons.some((reason) => reason.startsWith("NOT_FINAL_SALE")));
});

test("denies an out-of-window refund", () => {
  const result = evaluateRefundEligibility(
    customer("cus_003"),
    order("ord_8903"),
    request({ customerId: "cus_003", orderId: "ord_8903", itemId: "item_003" }),
    { policy: testPolicy },
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.denialReasons.some((reason) => reason.startsWith("WITHIN_WINDOW")));
});

test("denies used merchandise for a changed-mind request", () => {
  const result = evaluateRefundEligibility(
    customer("cus_004"),
    order("ord_8904"),
    request({ customerId: "cus_004", orderId: "ord_8904", itemId: "item_004", condition: "USED" }),
    { policy: testPolicy },
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.denialReasons.some((reason) => reason.startsWith("CONDITION_ALLOWED")));
});

test("denies automated refund for a high-risk account", () => {
  const result = evaluateRefundEligibility(
    customer("cus_006"),
    order("ord_8905"),
    request({ customerId: "cus_006", orderId: "ord_8905", itemId: "item_005" }),
    { policy: testPolicy },
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.denialReasons.some((reason) => reason.startsWith("RISK_NOT_HIGH")));
});

test("allows opened items for not-as-described claims when configured in policy", () => {
  const result = evaluateRefundEligibility(
    customer("cus_001"),
    order("ord_8901"),
    request({ reason: "NOT_AS_DESCRIBED", condition: "OPENED" }),
    { policy: testPolicy },
  );
  assert.equal(result.decision, "APPROVE");
});

test("prevents refund quantity from exceeding purchased quantity", () => {
  const result = evaluateRefundEligibility(customer("cus_001"), order("ord_8901"), request({ quantity: 2 }), { policy: testPolicy });
  assert.equal(result.decision, "DENY");
  assert.ok(result.denialReasons.some((reason) => reason.startsWith("VALID_QUANTITY")));
});
