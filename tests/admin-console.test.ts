import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { DEFAULT_TENANT_ID } from "@/domain/tenant/constants";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { AuditLogRepository } from "@/repositories/audit-log.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { UserRepository } from "@/repositories/user.repository";
import { hashPassword } from "@/security/password";
import { createAdminSessionToken } from "@/security/admin-session";
import { requireStaffPermission } from "@/security/staff-authorization";
import { createSupportSession } from "@/services/support/support-session.service";
import { ensureDefaultTenant, resetTenantContextCache } from "@/services/tenant/tenant-context.service";

const OTHER_TENANT_ID = "ten_other";

function sessionRequest(token: string, path = "https://jobform.test/api/admin/integrations") {
  return new Request(path, {
    headers: { cookie: `jobform_admin=${encodeURIComponent(token)}` },
  });
}

test("admin conversations list a session transcript without leaking another tenant", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    resetTenantContextCache();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO tenants (id, name, slug, status, settings_json, created_at, updated_at)
      VALUES (?, 'Other Merchant', 'other', 'ACTIVE', '{}', ?, ?)`).run(OTHER_TENANT_ID, now, now);
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, 'Other Shopper', 'other-shopper@example.com', 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_other", OTHER_TENANT_ID, now);

    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    new SupportSessionRepository(db).appendMessage({
      sessionId: created.session.id,
      role: "CUSTOMER",
      content: "I would like a refund for the headphones.",
    });

    const listed = new SupportSessionRepository(db, DEFAULT_TENANT_ID).listConversations();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.customerName, "Maya Patel");
    assert.match(listed[0]?.lastMessagePreview ?? "", /headphones/);

    const detail = new SupportSessionRepository(db, DEFAULT_TENANT_ID).getConversation(created.session.id);
    assert.equal(detail?.messages.at(-1)?.content, "I would like a refund for the headphones.");
    assert.equal(new SupportSessionRepository(db, OTHER_TENANT_ID).getConversation(created.session.id), null);
    assert.deepEqual(new SupportSessionRepository(db, OTHER_TENANT_ID).listConversations(), []);
  } finally {
    db.close();
    resetTenantContextCache();
  }
});

test("admin decisions show policy denials and analytics counts conversations", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_002", orderId: "ord_8902" });
    const runs = new AgentRunRepository(db);
    const runId = runs.create({ model: "test-model", inputText: "Refund the tee." });
    runs.setContext(runId, { customerId: created.customer.id, orderId: created.order.id });
    runs.appendEvent({
      runId,
      type: "DECISION",
      status: "FAILED",
      title: "Refund denied",
      metadata: { decision: "DENY", refundAmountCents: 0 },
    });

    const decisions = new AdminReadRepository(db).listDecisions();
    assert.equal(decisions[0]?.outcome, "DENIED_BY_POLICY");
    assert.equal(decisions[0]?.customerName, "Noah Williams");

    const analytics = new AdminReadRepository(db).getAnalyticsSnapshot();
    assert.equal(analytics.conversations, 1);
    assert.equal(analytics.policyDenials >= 1, true);
  } finally {
    db.close();
  }
});

test("resolving an escalation writes an audit row", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const tenantId = ensureDefaultTenant(db);
    const manager = new UserRepository(db).createUser({
      tenantId,
      email: "manager@jobform.example",
      passwordHash: hashPassword("manager-pass-1234"),
      role: "SUPPORT_MANAGER",
    });
    const runId = new AgentRunRepository(db).create({ model: "test-model", inputText: "Need a human." });
    const escalation = new SupportEscalationRepository(db).createOrGet({
      runId,
      customerId: "cus_001",
      orderId: "ord_8901",
      reasonCode: "CUSTOMER_REQUEST",
      summary: "Customer asked for a specialist.",
      priority: "HIGH",
    });

    const resolved = new SupportEscalationRepository(db).resolve(escalation.id, {
      resolvedByUserId: manager.id,
      notes: "Called the customer.",
    });
    assert.equal(resolved.status, "RESOLVED");
    assert.equal(resolved.notes, "Called the customer.");

    new AuditLogRepository(db, tenantId).record({
      actorUserId: manager.id,
      action: "ESCALATION_RESOLVED",
      resourceType: "support_escalation",
      resourceId: resolved.id,
      metadata: { runId },
    });
    const events = new AuditLogRepository(db, tenantId).listRecent();
    assert.equal(events[0]?.action, "ESCALATION_RESOLVED");
    assert.equal(events[0]?.actorEmail, "manager@jobform.example");
  } finally {
    db.close();
  }
});

test("integration status never returns secrets and viewers cannot open the page API", () => {
  const previous = {
    secret: process.env.ADMIN_SESSION_SECRET,
    commerceSecret: process.env.BUSINESS_INTEGRATION_SECRET,
  };
  process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-product-tests-123456";
  process.env.BUSINESS_INTEGRATION_SECRET = "super-secret-integration-token-value-32chars";
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    const status = new AdminReadRepository(db, tenantId).getIntegrationStatus();
    assert.equal(JSON.stringify(status).includes("super-secret"), false);
    assert.equal("webhooks" in status, true);

    const viewer = new UserRepository(db).createUser({
      tenantId,
      email: "viewer@jobform.example",
      passwordHash: hashPassword("viewer-pass-1234"),
      role: "VIEWER",
    });
    const token = createAdminSessionToken({
      userId: viewer.id,
      email: viewer.email,
      tenantId: viewer.tenantId,
      role: viewer.role,
    });
    const denied = requireStaffPermission(sessionRequest(token), "integrations:manage");
    assert.ok(denied instanceof Response);
    assert.equal((denied as Response).status, 403);
  } finally {
    if (previous.secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous.secret;
    if (previous.commerceSecret === undefined) delete process.env.BUSINESS_INTEGRATION_SECRET;
    else process.env.BUSINESS_INTEGRATION_SECRET = previous.commerceSecret;
    db.close();
    closeDatabaseForTests();
  }
});
