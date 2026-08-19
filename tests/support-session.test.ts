import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { createSupportSession, getSupportSessionDetail } from "@/services/support/support-session.service";

test("support session binds one customer to one owned order and persists a welcome message", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    assert.equal(created.customer.email, "maya@example.com");
    assert.equal(created.order.customerId, "cus_001");
    assert.equal(created.messages.length, 1);
    assert.equal(created.messages[0]?.role, "AGENT");

    const reloaded = await getSupportSessionDetail(db, created.session.id);
    assert.equal(reloaded.session.orderId, "ord_8901");
    assert.deepEqual(reloaded.messages, created.messages);
  } finally {
    db.close();
  }
});

test("support messages persist run correlation for customer and agent messages", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    const repo = new SupportSessionRepository(db);
    new AgentRunRepository(db).create({ id: "run_test", model: "test-model", inputText: "test" });
    repo.appendMessage({ sessionId: created.session.id, runId: "run_test", role: "CUSTOMER", content: "Please refund it." });
    repo.appendMessage({ sessionId: created.session.id, runId: "run_test", role: "AGENT", content: "I checked the policy." });

    const messages = repo.listMessages(created.session.id).filter((message) => message.runId === "run_test");
    assert.equal(messages.length, 2);
    assert.deepEqual(messages.map((message) => message.role), ["CUSTOMER", "AGENT"]);
  } finally {
    db.close();
  }
});
