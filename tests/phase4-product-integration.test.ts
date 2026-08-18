import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedDemoData } from "@/db/seed";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import { supportOutcomeFromEvent } from "@/lib/support-outcome";
import {
  listSupportCustomers,
  listSupportOrdersForCustomer,
} from "@/services/support/support-context.service";

function event(input: Partial<PersistedAgentEvent> & Pick<PersistedAgentEvent, "type">): PersistedAgentEvent {
  return {
    id: "evt_test",
    runId: "run_test",
    sequence: 1,
    type: input.type,
    status: input.status ?? null,
    title: input.title ?? "Test event",
    toolName: input.toolName ?? null,
    callId: input.callId ?? null,
    durationMs: input.durationMs ?? null,
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? "2026-08-18T12:00:00Z",
  };
}

test("support product context lists CRM customers and only customer-owned orders", async () => {
  const db = createDatabase(":memory:");
  seedDemoData(db);
  try {
    const customers = await listSupportCustomers(db);
    assert.equal(customers.length, 15);
    assert.equal(customers.find((customer) => customer.id === "cus_001")?.name, "Maya Patel");

    const mayaOrders = await listSupportOrdersForCustomer(db, "cus_001");
    assert.deepEqual(mayaOrders.map((order) => order.id), ["ord_demo_approve"]);
    assert.deepEqual(mayaOrders[0]?.itemNames, ["Studio Headphones"]);

    const customerWithoutSeededOrders = await listSupportOrdersForCustomer(db, "cus_015");
    assert.deepEqual(customerWithoutSeededOrders, []);
  } finally {
    db.close();
  }
});

test("support outcome renders deterministic policy denial metadata without frontend policy logic", () => {
  const outcome = supportOutcomeFromEvent(event({
    type: "DECISION",
    status: "FAILED",
    metadata: {
      decision: "DENY",
      refundAmountCents: 0,
      denialReasons: ["NOT_FINAL_SALE: Final-sale items cannot be refunded."],
    },
  }));

  assert.deepEqual(outcome, {
    kind: "DENIED",
    amountCents: 0,
    refundId: null,
    title: "Refund not eligible",
    description: "Final-sale items cannot be refunded.",
  });
});

test("support outcome shows eligibility only from persisted decision metadata", () => {
  const outcome = supportOutcomeFromEvent(event({
    type: "DECISION",
    status: "SUCCESS",
    metadata: { decision: "APPROVE", refundAmountCents: 8900, denialReasons: [] },
  }));

  assert.equal(outcome?.kind, "APPROVED");
  assert.equal(outcome?.amountCents, 8900);
  assert.equal(outcome?.title, "Refund eligible");
});

test("successful persisted refund execution supersedes eligibility with completed refund reference", () => {
  const outcome = supportOutcomeFromEvent(event({
    type: "REFUND_EXECUTION",
    status: "SUCCESS",
    metadata: {
      status: "COMPLETED",
      refund: { id: "ref_123", amountCents: 8900 },
    },
  }));

  assert.deepEqual(outcome, {
    kind: "APPROVED",
    amountCents: 8900,
    refundId: "ref_123",
    title: "Refund completed",
    description: "The approved refund was recorded successfully.",
  });
});
