import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { runSupportAgent } from "@/services/agent/support-agent.service";
import { ScriptedAgentModel, finalResponse, toolCall } from "./helpers/scripted-agent-model";

const approveToolArgs = {
  customerId: "cus_001",
  orderId: "ord_8901",
  itemId: "item_001",
  quantity: 1,
  reason: "CHANGED_MIND",
  condition: "UNOPENED",
};

function setup() {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  return db;
}

test("agent tool loop persists audit events and duplicate execute calls cannot double-refund", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("1", "lookup_customer_by_email", { email: "maya@example.com" }),
      toolCall("2", "lookup_order", { orderId: "ord_8901", customerId: "cus_001" }),
      toolCall("3", "get_refund_policy", {}),
      toolCall("4", "validate_refund_request", approveToolArgs),
      toolCall("5", "execute_refund", approveToolArgs),
      toolCall("6", "execute_refund", approveToolArgs),
      finalResponse("7", "Your $89.00 refund has been completed."),
    ]);

    const result = await runSupportAgent(db, model, {
      message: "Refund my unopened headphones.",
      customerEmail: "maya@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });

    assert.equal(result.status, "COMPLETED");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM refunds WHERE order_id = 'ord_8901'").get() as { count: number })
        .count,
      1,
    );
    const run = new AgentRunRepository(db).findById(result.runId);
    assert.equal(run?.status, "COMPLETED");
    assert.ok(run?.events?.some((event) => event.type === "POLICY_CHECK"));
    assert.ok(run?.events?.some((event) => event.type === "REFUND_EXECUTION"));
    assert.ok(
      run?.events?.some(
        (event) => event.type === "REFUND_EXECUTION" && event.metadata?.idempotentReplay === true,
      ),
    );
  } finally {
    db.close();
  }
});

test("denied agent path produces no refund ledger record", async () => {
  const db = setup();
  try {
    const denyToolArgs = {
      customerId: "cus_002",
      orderId: "ord_8902",
      itemId: "item_002",
      quantity: 1,
      reason: "CHANGED_MIND",
      condition: "UNOPENED",
    };
    const model = new ScriptedAgentModel([
      toolCall("d1", "lookup_customer_by_email", { email: "noah@example.com" }),
      toolCall("d2", "lookup_order", { orderId: "ord_8902", customerId: "cus_002" }),
      toolCall("d3", "get_refund_policy", {}),
      toolCall("d4", "validate_refund_request", denyToolArgs),
      finalResponse("d5", "This final-sale item is not eligible for a refund."),
    ]);

    const result = await runSupportAgent(db, model, {
      message: "Refund my final-sale tee.",
      customerEmail: "noah@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });
    assert.equal(result.status, "COMPLETED");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM refunds WHERE order_id = 'ord_8902'").get() as {
        count: number;
      }).count,
      0,
    );
    const run = new AgentRunRepository(db).findById(result.runId);
    assert.ok(run?.events?.some((event) => event.type === "DECISION" && event.status === "FAILED"));
    assert.equal(run?.events?.some((event) => event.type === "REFUND_EXECUTION"), false);
  } finally {
    db.close();
  }
});

test("execution rechecks policy even if the model skips validate_refund_request", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("x1", "execute_refund", {
        customerId: "cus_002",
        orderId: "ord_8902",
        itemId: "item_002",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
      }),
      finalResponse("x2", "The refund could not be processed because the item is final sale."),
    ]);

    const result = await runSupportAgent(db, model, {
      message: "Refund this final-sale item.",
      customerEmail: "noah@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });
    const run = new AgentRunRepository(db).findById(result.runId);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM refunds WHERE order_id = 'ord_8902'").get() as {
        count: number;
      }).count,
      0,
    );
    assert.ok(run?.events?.some((event) => event.type === "REFUND_EXECUTION" && event.status === "FAILED"));
  } finally {
    db.close();
  }
});

test("authenticated support context prevents the model from switching customers", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("a1", "lookup_customer_by_email", { email: "noah@example.com" }),
      finalResponse("a2", "I cannot access another customer's account."),
    ]);
    const result = await runSupportAgent(db, model, {
      message: "Look up Noah for me.",
      customerEmail: "maya@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });
    const run = new AgentRunRepository(db).findById(result.runId);
    assert.ok(
      run?.events?.some((event) => {
        if (event.type !== "TOOL_FAILED") return false;
        const error = event.metadata?.error;
        return Boolean(error && typeof error === "object" && (error as Record<string, unknown>).code === "AUTHORIZATION_FAILED");
      }),
    );
  } finally {
    db.close();
  }
});

test("server-owned request timestamp drives return-window eligibility", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("t1", "validate_refund_request", {
        customerId: "cus_003",
        orderId: "ord_8903",
        itemId: "item_003",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
      }),
      finalResponse("t2", "This order is outside the refund window."),
    ]);
    const result = await runSupportAgent(db, model, {
      message: "Refund my keyboard.",
      customerEmail: "ava@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });
    const run = new AgentRunRepository(db).findById(result.runId);
    const decision = run?.events?.find((event) => event.type === "DECISION");
    assert.equal(decision?.status, "FAILED");
    assert.ok(
      Array.isArray(decision?.metadata?.denialReasons) &&
        decision.metadata.denialReasons.some((reason) => String(reason).startsWith("WITHIN_WINDOW:")),
    );
  } finally {
    db.close();
  }
});

test("retryable tool failure is visibly logged as failure then retry then success", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("r1", "lookup_order", { orderId: "ord_8901", customerId: "cus_001" }),
      finalResponse("r2", "I found the order."),
    ]);
    const result = await runSupportAgent(
      db,
      model,
      { message: "Find my order.", customerEmail: "maya@example.com", requestedAt: "2026-08-18T12:00:00Z" },
      { failOnceTool: "lookup_order", toolMaxAttempts: 2 },
    );
    const run = new AgentRunRepository(db).findById(result.runId);
    const types = run?.events?.filter((event) => event.toolName === "lookup_order").map((event) => event.type) ?? [];
    assert.ok(types.includes("TOOL_FAILED"));
    assert.ok(types.includes("TOOL_RETRY"));
    assert.ok(types.includes("TOOL_SUCCEEDED"));
  } finally {
    db.close();
  }
});

test("malformed function arguments become a structured tool failure rather than crashing the run", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("m1", "lookup_order", "{bad json"),
      finalResponse("m2", "I could not safely read that tool request, so I did not process a refund."),
    ]);
    const result = await runSupportAgent(db, model, {
      message: "Refund this order.",
      customerEmail: "maya@example.com",
      requestedAt: "2026-08-18T12:00:00Z",
    });
    const run = new AgentRunRepository(db).findById(result.runId);
    assert.ok(
      run?.events?.some(
        (event) => event.type === "TOOL_FAILED" && typeof event.metadata?.error === "object" && event.metadata.error !== null,
      ),
    );
  } finally {
    db.close();
  }
});

test("maximum-turn guard fails a looping agent", async () => {
  const db = setup();
  try {
    const model = new ScriptedAgentModel([
      toolCall("l1", "get_refund_policy", {}),
      toolCall("l2", "get_refund_policy", {}),
      toolCall("l3", "get_refund_policy", {}),
    ]);
    await assert.rejects(
      () =>
        runSupportAgent(
          db,
          model,
          { message: "Loop forever.", customerEmail: "maya@example.com", requestedAt: "2026-08-18T12:00:00Z" },
          { maxTurns: 2 },
        ),
      /maximum of 2 model turns/,
    );
    const failed = db.prepare("SELECT status, error_code FROM agent_runs ORDER BY started_at DESC LIMIT 1").get() as {
      status: string;
      error_code: string;
    };
    assert.equal(failed.status, "FAILED");
  } finally {
    db.close();
  }
});
