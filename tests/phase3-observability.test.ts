import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { runSupportAgent } from "@/services/agent/support-agent.service";
import { ScriptedAgentModel, finalResponse, toolCall } from "./helpers/scripted-agent-model";
import { seedActiveTestPolicy } from "./helpers/seed-policy";

const approveArgs = {
  customerId: "cus_001",
  orderId: "ord_8901",
  itemId: "item_001",
  quantity: 1,
  reason: "CHANGED_MIND",
  condition: "UNOPENED",
};

test("agent event observer receives persisted events in sequence for live streaming", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  seedActiveTestPolicy(db);
  const observed: PersistedAgentEvent[] = [];
  try {
    const model = new ScriptedAgentModel([
      toolCall("p3-1", "lookup_customer_by_email", { email: "maya@example.com" }),
      toolCall("p3-2", "lookup_order", { orderId: "ord_8901", customerId: "cus_001" }),
      toolCall("p3-3", "validate_refund_request", approveArgs),
      finalResponse("p3-4", "The order is eligible for an $89.00 refund."),
    ]);

    const result = await runSupportAgent(
      db,
      model,
      {
        message: "Check my refund eligibility.",
        customerEmail: "maya@example.com",
        orderId: "ord_8901",
        requestedAt: "2026-08-18T12:00:00Z",
      },
      { onEvent: (event) => { observed.push(event); } },
    );

    assert.ok(observed.length > 0);
    assert.equal(observed[0]?.type, "REQUEST_RECEIVED");
    assert.equal(observed.at(-1)?.type, "RUN_COMPLETED");
    assert.deepEqual(observed.map((event) => event.sequence), observed.map((_, index) => index + 1));

    const summary = new AdminReadRepository(db).listRunSummaries().find((run) => run.id === result.runId);
    assert.equal(summary?.orderId, "ord_8901");
    assert.equal(summary?.decision, "APPROVE");
  } finally {
    db.close();
  }
});

test("admin refund read model exposes only persisted money movement", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  seedActiveTestPolicy(db);
  try {
    const model = new ScriptedAgentModel([
      toolCall("p3-r1", "validate_refund_request", approveArgs),
      toolCall("p3-r2", "execute_refund", approveArgs),
      finalResponse("p3-r3", "Your $89.00 refund has been completed."),
    ]);
    await runSupportAgent(db, model, {
      message: "Refund my unopened headphones.",
      customerEmail: "maya@example.com",
      orderId: "ord_8901",
      requestedAt: "2026-08-18T12:00:00Z",
    });

    const rows = new AdminReadRepository(db).listRefunds();
    const refund = rows.find((row) => row.orderId === "ord_8901");
    assert.equal(refund?.customerName, "Maya Patel");
    assert.equal(refund?.itemName, "Studio Headphones");
    assert.equal(refund?.amountCents, 8900);
    assert.equal(refund?.status, "COMPLETED");
  } finally {
    db.close();
  }
});
