import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { signIntegrationPayload, verifyIntegrationRequest } from "@/security/integration-signature";
import { assertSupportSessionAccess, createSupportLaunchToken, SupportAccessError, verifySupportLaunchToken } from "@/security/support-access";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import { executeRefundAtomically } from "@/services/refund-execution.service";
import { createHostedSupportSession } from "@/services/support/support-session.service";
import { drainNotificationOutbox, type NotificationSender } from "@/services/notifications/notification.service";
import { evaluateRefundEligibility } from "@/services/refund-eligibility.service";
import { parseBusinessContextSnapshot, syncBusinessContext } from "@/services/integrations/business-sync.service";
import { createIntegratedSupportLaunch } from "@/services/integrations/support-launch.service";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { seedActiveTestPolicy } from "./helpers/seed-policy";

function setup() {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  seedActiveTestPolicy(db);
  return db;
}

test("published refund policy version changes deterministic eligibility at runtime", async () => {
  const db = setup();
  try {
    const policies = new RefundPolicyRepository(db);
    const draft = policies.createDraft({ version: "prod-test-1-day", refundWindowDays: 1 });
    const active = policies.publish(draft.id);
    const customer = await createSqliteCustomerRepository(db).findById("cus_001");
    const order = await createSqliteOrderRepository(db).findById("ord_8901");
    assert.ok(customer && order);
    const result = evaluateRefundEligibility(customer, order, {
      customerId: "cus_001",
      orderId: "ord_8901",
      itemId: "item_001",
      quantity: 1,
      reason: "CHANGED_MIND",
      condition: "UNOPENED",
      requestedAt: "2026-08-18T12:00:00Z",
    }, { policy: active });
    assert.equal(result.decision, "DENY");
    assert.ok(result.denialReasons.some((reason) => reason.startsWith("WITHIN_WINDOW:")));
  } finally {
    db.close();
  }
});

test("completed refund records policy version and enqueues one durable notification", () => {
  const db = setup();
  try {
    const result = executeRefundAtomically(db, {
      idempotencyKey: "prod-policy-outbox",
      request: {
        customerId: "cus_001",
        orderId: "ord_8901",
        itemId: "item_001",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: "2026-08-18T12:00:00Z",
      },
    });
    assert.equal(result.status, "COMPLETED");
    if (result.status !== "COMPLETED") return;
    assert.equal(result.refund.policyVersion, "test-policy");
    const outbox = new NotificationOutboxRepository(db).listRecent();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.eventType, "REFUND_COMPLETED");

    const replay = executeRefundAtomically(db, {
      idempotencyKey: "prod-policy-outbox",
      request: {
        customerId: "cus_001",
        orderId: "ord_8901",
        itemId: "item_001",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: "2026-08-18T12:00:05Z",
      },
    });
    assert.equal(replay.status, "COMPLETED");
    assert.equal(new NotificationOutboxRepository(db).listRecent().length, 1);
  } finally {
    db.close();
  }
});

test("notification outbox delivery is retry-safe and independent from refund execution", async () => {
  const db = setup();
  try {
    const outbox = new NotificationOutboxRepository(db);
    outbox.enqueue({
      eventKey: "test:notification:1",
      eventType: "REFUND_COMPLETED",
      recipient: "customer@example.com",
      subject: "Refund confirmed",
      payload: { refundId: "ref_test", orderId: "ord_test", amountCents: 1000 },
    });
    const sender: NotificationSender = {
      async send(notification) {
        assert.equal(notification.eventKey, "test:notification:1");
        return { providerMessageId: "email_123" };
      },
    };
    const result = await drainNotificationOutbox(db, { sender });
    assert.deepEqual(result, { processed: 1, sent: 1, failed: 0 });
    const stored = outbox.findByEventKey("test:notification:1");
    assert.equal(stored?.status, "SENT");
    assert.equal(stored?.providerMessageId, "email_123");
  } finally {
    db.close();
  }
});

test("business integration signature validates authentic requests and rejects stale timestamps", () => {
  const secret = "a".repeat(40);
  const rawBody = JSON.stringify({ hello: "world" });
  const nowMs = 1_800_000_000_000;
  const timestamp = String(nowMs);
  const eventId = "evt-business-1";
  const signature = signIntegrationPayload({ secret, timestamp, eventId, rawBody });

  assert.deepEqual(
    verifyIntegrationRequest({ secret, timestamp, eventId, signature: `sha256=${signature}`, rawBody, nowMs }),
    { eventId, timestampMs: nowMs },
  );
  assert.throws(() => verifyIntegrationRequest({
    secret,
    timestamp: String(nowMs - 10 * 60_000),
    eventId,
    signature,
    rawBody,
    nowMs,
  }));
});

test("signed business snapshot sync is idempotent and preserves canonical customer ownership", async () => {
  const db = setup();
  try {
    const payload = {
      customer: {
        id: "cus_external_1",
        name: "External Customer",
        email: "external@example.com",
        accountStatus: "ACTIVE",
        riskLevel: "LOW",
        lifetimeOrders: 1,
        lifetimeRefunds: 0,
        createdAt: "2026-08-18T00:00:00Z",
      },
      orders: [{
        id: "ord_external_1",
        customerId: "cus_external_1",
        status: "DELIVERED",
        currency: "USD",
        subtotalCents: 2500,
        shippingCents: 0,
        taxCents: 0,
        totalPaidCents: 2500,
        refundedCents: 0,
        placedAt: "2026-08-10T00:00:00Z",
        deliveredAt: "2026-08-15T00:00:00Z",
        items: [{ id: "item_external_1", sku: "EXT-1", name: "External Item", quantity: 1, unitPriceCents: 2500, finalSale: false, refundable: true }],
      }],
    };
    const rawBody = JSON.stringify(payload);
    const snapshot = parseBusinessContextSnapshot(payload);
    const first = syncBusinessContext(db, { source: "test", eventId: "evt_external_1", rawBody, snapshot });
    const second = syncBusinessContext(db, { source: "test", eventId: "evt_external_1", rawBody, snapshot });
    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal((await createSqliteOrderRepository(db).findForCustomer("ord_external_1", "cus_external_1"))?.id, "ord_external_1");
    assert.equal(await createSqliteOrderRepository(db).findForCustomer("ord_external_1", "cus_001"), null);
  } finally {
    db.close();
  }
});

test("persisted agent-event metadata redacts sensitive nested fields", () => {
  const db = setup();
  try {
    const repository = new AgentRunRepository(db);
    const runId = repository.create({ model: "test", inputText: "safe" });
    const event = repository.appendEvent({
      runId,
      type: "TOOL_SUCCEEDED",
      status: "SUCCESS",
      title: "redaction",
      metadata: { result: { email: "maya@example.com", id: "cus_001" } },
    });
    assert.deepEqual(event.metadata, { result: { email: "[REDACTED]", id: "cus_001" } });
  } finally {
    db.close();
  }
});

test("human escalation tool creates one durable high-priority handoff for the authenticated customer", async () => {
  const db = setup();
  try {
    const { createRefundToolRegistry } = await import("@/tools/agent/refund-tool-registry");
    const runRepository = new AgentRunRepository(db);
    const runId = runRepository.create({ model: "test", inputText: "escalate" });
    const tools = createRefundToolRegistry(db, {
      authenticatedCustomerEmail: "maya@example.com",
      requestTimestamp: "2026-08-18T12:00:00Z",
    });
    const tool = tools.get("escalate_to_human");
    assert.ok(tool);
    const result = await tool.execute({
      customerId: "cus_001",
      orderId: "ord_8901",
      reasonCode: "TOOL_FAILURE",
      summary: "The automated workflow cannot safely complete the requested action.",
    }, { runId, runRepository, signal: new AbortController().signal });
    assert.equal((result as { status: string }).status, "OPEN");
    assert.equal((result as { priority: string }).priority, "HIGH");

    const replay = await tool.execute({
      customerId: "cus_001",
      orderId: "ord_8901",
      reasonCode: "TOOL_FAILURE",
      summary: "Retrying should reuse the same durable handoff.",
    }, { runId, runRepository, signal: new AbortController().signal });
    assert.equal((replay as { id: string }).id, (result as { id: string }).id);
  } finally {
    db.close();
  }
});


test("host support launch is signed, short-lived, single-use, and exchanges to session access", async () => {
  const previousMode = process.env.SUPPORT_ENTRY;
  const previousSecret = process.env.SUPPORT_LAUNCH_SECRET;
  process.env.SUPPORT_ENTRY = "host";
  process.env.SUPPORT_LAUNCH_SECRET = "support-launch-secret-for-production-tests-123456";
  const db = setup();
  try {
    const token = createSupportLaunchToken({
      customerId: "cus_001",
      orderId: "ord_8901",
      jti: "launch_prod_test_001",
      expiresInSeconds: 120,
    });
    const claims = verifySupportLaunchToken(token);
    assert.equal(claims.customerId, "cus_001");
    assert.equal(claims.orderId, "ord_8901");

    const created = await createHostedSupportSession(db, claims);
    assert.equal(created.detail.session.customerId, "cus_001");
    assert.ok(created.accessToken.length >= 32);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM support_launch_tokens WHERE jti = ?").get(claims.jti) as { count: number }).count,
      1,
    );

    await assert.rejects(() => createHostedSupportSession(db, claims), (error: unknown) => {
      assert.ok(error instanceof SupportAccessError);
      assert.equal(error.code, "SUPPORT_LAUNCH_ALREADY_USED");
      return true;
    });

    assert.throws(() => verifySupportLaunchToken(token, claims.exp), (error: unknown) => {
      assert.ok(error instanceof SupportAccessError);
      assert.equal(error.code, "SUPPORT_LAUNCH_EXPIRED");
      return true;
    });
  } finally {
    db.close();
    if (previousMode === undefined) delete process.env.SUPPORT_ENTRY;
    else process.env.SUPPORT_ENTRY = previousMode;
    if (previousSecret === undefined) delete process.env.SUPPORT_LAUNCH_SECRET;
    else process.env.SUPPORT_LAUNCH_SECRET = previousSecret;
  }
});

test("host support session credential protects session reads and rejects invalid bearer tokens", async () => {
  const previousMode = process.env.SUPPORT_ENTRY;
  const previousSecret = process.env.SUPPORT_LAUNCH_SECRET;
  process.env.SUPPORT_ENTRY = "host";
  process.env.SUPPORT_LAUNCH_SECRET = "support-launch-secret-for-production-tests-123456";
  const db = setup();
  try {
    const token = createSupportLaunchToken({
      customerId: "cus_001",
      orderId: "ord_8901",
      jti: "launch_prod_test_002",
      expiresInSeconds: 120,
    });
    const created = await createHostedSupportSession(db, verifySupportLaunchToken(token));
    const sessionId = created.detail.session.id;

    assert.doesNotThrow(() => assertSupportSessionAccess(
      db,
      sessionId,
      new Request("https://support.example.test/api/support/session", {
        headers: { Authorization: `Bearer ${created.accessToken}` },
      }),
    ));

    assert.throws(() => assertSupportSessionAccess(
      db,
      sessionId,
      new Request("https://support.example.test/api/support/session"),
    ), (error: unknown) => {
      assert.ok(error instanceof SupportAccessError);
      assert.equal(error.code, "SUPPORT_SESSION_ACCESS_DENIED");
      return true;
    });

    assert.throws(() => assertSupportSessionAccess(
      db,
      sessionId,
      new Request("https://support.example.test/api/support/session", {
        headers: { Authorization: "Bearer incorrect-session-capability" },
      }),
    ), (error: unknown) => {
      assert.ok(error instanceof SupportAccessError);
      assert.equal(error.code, "SUPPORT_SESSION_ACCESS_DENIED");
      return true;
    });
  } finally {
    db.close();
    if (previousMode === undefined) delete process.env.SUPPORT_ENTRY;
    else process.env.SUPPORT_ENTRY = previousMode;
    if (previousSecret === undefined) delete process.env.SUPPORT_LAUNCH_SECRET;
    else process.env.SUPPORT_LAUNCH_SECRET = previousSecret;
  }
});


test("signed business integration can issue a customer-owned one-time support launch URL", async () => {
  const previousSecret = process.env.SUPPORT_LAUNCH_SECRET;
  process.env.SUPPORT_LAUNCH_SECRET = "support-launch-secret-for-production-tests-123456";
  const db = setup();
  try {
    const launch = await createIntegratedSupportLaunch(db, {
      customerId: "cus_001",
      orderId: "ord_8901",
      integrationEventId: "evt_launch_integration_1",
      baseUrl: "https://support.example.test/",
    });
    assert.equal(launch.customerId, "cus_001");
    assert.equal(launch.orderId, "ord_8901");
    assert.ok(launch.launchUrl.startsWith("https://support.example.test/support#launch="));
    const encoded = launch.launchUrl.split("#launch=")[1];
    assert.ok(encoded);
    const claims = verifySupportLaunchToken(decodeURIComponent(encoded));
    assert.equal(claims.customerId, "cus_001");
    assert.equal(claims.orderId, "ord_8901");

    await assert.rejects(() => createIntegratedSupportLaunch(db, {
      customerId: "cus_002",
      orderId: "ord_8901",
      integrationEventId: "evt_launch_integration_wrong_owner",
      baseUrl: "https://support.example.test",
    }));
  } finally {
    db.close();
    if (previousSecret === undefined) delete process.env.SUPPORT_LAUNCH_SECRET;
    else process.env.SUPPORT_LAUNCH_SECRET = previousSecret;
  }
});


test("database rate limiter bounds repeated support operations and resets after the window", () => {
  const db = setup();
  try {
    const first = consumeRateLimit(db, { key: "support-chat:ses_test", limit: 2, windowMs: 60_000, nowMs: 1_000_000 });
    const second = consumeRateLimit(db, { key: "support-chat:ses_test", limit: 2, windowMs: 60_000, nowMs: 1_001_000 });
    assert.equal(first.remaining, 1);
    assert.equal(second.remaining, 0);
    assert.throws(
      () => consumeRateLimit(db, { key: "support-chat:ses_test", limit: 2, windowMs: 60_000, nowMs: 1_002_000 }),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitExceededError);
        assert.ok(error.retryAfterSeconds > 0);
        return true;
      },
    );
    const reset = consumeRateLimit(db, { key: "support-chat:ses_test", limit: 2, windowMs: 60_000, nowMs: 1_060_001 });
    assert.equal(reset.remaining, 1);
  } finally {
    db.close();
  }
});
