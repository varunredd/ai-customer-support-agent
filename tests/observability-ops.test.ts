import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { OutboundWebhookRepository } from "@/repositories/outbound-webhook.repository";
import { listOperationalEvents, operationalLog } from "@/lib/observability/system-logger";
import { saveTenantIntegration } from "@/services/integrations/tenant-integration.service";
import { ensureDefaultTenant, resetTenantContextCache } from "@/services/tenant/tenant-context.service";

const SESSION_SECRET = "admin-session-secret-for-product-tests-123456";

test("operational logs persist tenant_id, run_id, and session_id", () => {
  const previous = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    operationalLog({
      severity: "ERROR",
      source: "support-agent",
      code: "AGENT_RUN_FAILED",
      message: "Agent run failed.",
      runId: null,
      sessionId: "ses_obs_1",
      metadata: { orderId: "ord_8901" },
    }, db);
    const events = listOperationalEvents(db, 10, tenantId);
    assert.equal(events[0]?.sessionId, "ses_obs_1");
    assert.equal(events[0]?.code, "AGENT_RUN_FAILED");
    assert.match(JSON.stringify(events[0]), /ses_obs_1/);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous;
    db.close();
    closeDatabaseForTests();
    resetTenantContextCache();
  }
});

test("failed-run queue and analytics expose latency, escalations, and dead letters", () => {
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    const runs = new AgentRunRepository(db, tenantId);
    const okId = runs.create({ model: "test-model", inputText: "ok" });
    db.prepare("UPDATE agent_runs SET started_at = ?, completed_at = ?, status = 'COMPLETED' WHERE id = ?")
      .run("2026-08-20T12:00:00.000Z", "2026-08-20T12:00:01.200Z", okId);
    const failId = runs.create({ model: "test-model", inputText: "fail" });
    runs.fail(failId, "AGENT_RUN_FAILED", "Model timed out.");
    db.prepare("UPDATE agent_runs SET started_at = ?, completed_at = ? WHERE id = ?")
      .run("2026-08-20T12:00:00.000Z", "2026-08-20T12:00:02.000Z", failId);

    const listed = new AdminReadRepository(db, tenantId).listRunSummaries(20, { status: "FAILED" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, failId);
    assert.equal(listed[0]?.errorCode, "AGENT_RUN_FAILED");
    assert.equal(listed[0]?.durationMs, 2000);

    const analytics = new AdminReadRepository(db, tenantId).getAnalyticsSnapshot();
    assert.equal(analytics.runsFailed, 1);
    assert.equal(analytics.p95LatencyMs, 2000);
    assert.equal(analytics.openaiCostUsd, null);
    assert.equal(typeof analytics.escalationRate, "number");
    assert.equal(analytics.webhookDead, 0);
  } finally {
    db.close();
    closeDatabaseForTests();
    resetTenantContextCache();
  }
});

test("dead webhook deliveries can be requeued for another drain", () => {
  const previous = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    saveTenantIntegration(db, tenantId, {
      provider: "webhook",
      config: { url: "https://hooks.example.test/jobform", events: ["refund.completed"] },
      secret: "observability-webhook-secret-32chars",
    });
    const repo = new OutboundWebhookRepository(db, tenantId);
    const delivery = repo.enqueue({
      eventType: "refund.completed",
      eventKey: "refund.completed:obs_dead",
      payload: { test: true },
    });
    db.prepare("UPDATE outbound_webhook_deliveries SET status = 'DEAD', attempts = 8 WHERE id = ?").run(delivery.id);
    assert.equal(repo.countByStatus().DEAD, 1);
    assert.equal(repo.requeueDead(delivery.id), 1);
    assert.equal(repo.findById(delivery.id)?.status, "PENDING");
    assert.equal(repo.countByStatus().DEAD, 0);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous;
    db.close();
    closeDatabaseForTests();
    resetTenantContextCache();
  }
});
