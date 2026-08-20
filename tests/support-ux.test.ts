import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { tenantBrandingFromRecord } from "@/domain/tenant/branding";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { TenantRepository } from "@/repositories/tenant.repository";
import { listPortalOrdersByEmail } from "@/services/support/support-context.service";
import { getSupportBranding } from "@/services/support/support-branding.service";
import { createSupportSession, getSupportSessionDetail, InvalidSupportContextError } from "@/services/support/support-session.service";
import { buildPolicyWindow, deriveReturnStatus } from "@/services/support/support-workspace.service";
import { supportOutcomeFromEvent } from "@/lib/support-outcome";
import type { PersistedAgentEvent } from "@/domain/agent/types";

test("portal order lookup lists customer-owned orders without exposing a customer directory id", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const lookup = await listPortalOrdersByEmail(db, "maya@example.com");
    assert.equal(lookup.customerName, "Maya Patel");
    assert.deepEqual(lookup.orders.map((order) => order.id), ["ord_8901"]);
    assert.equal("customerId" in lookup, false);
    assert.equal("id" in lookup, false);
  } finally {
    db.close();
  }
});

test("portal order lookup uses one generic error for unknown email or a customer with no orders", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    await assert.rejects(
      () => listPortalOrdersByEmail(db, "nobody@example.com"),
      (error: unknown) => {
        assert.ok(error instanceof InvalidSupportContextError);
        assert.match(error.message, /could not find a matching order/i);
        return true;
      },
    );
    await assert.rejects(
      () => listPortalOrdersByEmail(db, "evelyn@example.com"),
      (error: unknown) => {
        assert.ok(error instanceof InvalidSupportContextError);
        assert.match(error.message, /could not find a matching order/i);
        return true;
      },
    );
  } finally {
    db.close();
  }
});

test("workspace policy window counts remaining days from delivery and hides risk internals", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    const window = buildPolicyWindow(created.order, 30, "2026-08-20T12:00:00Z");
    assert.equal(window.daysElapsed, 8);
    assert.equal(window.daysRemaining, 22);
    assert.equal(window.open, true);

    const runId = new AgentRunRepository(db).create({ model: "test-model", inputText: "Please refund." });
    new AgentRunRepository(db).appendEvent({
      runId,
      type: "POLICY_CHECK",
      status: "SUCCESS",
      title: "Deterministic refund policy evaluated",
      metadata: {
        policyVersion: "v1",
        checks: [
          { code: "ACCOUNT_ACTIVE", passed: true, summary: "Customer account must be active." },
          { code: "RISK_NOT_HIGH", passed: true, summary: "High-risk accounts require a human workflow." },
        ],
      },
    });
    new SupportSessionRepository(db).appendMessage({
      sessionId: created.session.id,
      runId,
      role: "CUSTOMER",
      content: "Please refund the headphones.",
    });

    const detail = await getSupportSessionDetail(db, created.session.id);
    assert.equal(detail.workspace.returnStatus, "NONE");
    assert.deepEqual(detail.workspace.policyChecks.map((check) => check.code), ["ACCOUNT_ACTIVE"]);
    assert.equal(detail.branding.name, "Default Merchant");
  } finally {
    db.close();
  }
});

test("workspace return status follows ledger refunds and pending approval", () => {
  assert.equal(deriveReturnStatus({ refundedCents: 3000, totalPaidCents: 7180, pendingApproval: false }), "PARTIAL_REFUND");
  assert.equal(deriveReturnStatus({ refundedCents: 7180, totalPaidCents: 7180, pendingApproval: false }), "REFUND_APPROVED");
  assert.equal(deriveReturnStatus({ refundedCents: 0, totalPaidCents: 10512, pendingApproval: true }), "PENDING_APPROVAL");
});

test("tenant branding reads public settings and rejects unsafe logo or accent values", () => {
  const branding = tenantBrandingFromRecord({
    name: "Default Merchant",
    settings: {
      brandName: "NovaShop",
      logoUrl: "https://cdn.novashop.example/logo.svg",
      accent: "#0f766e",
    },
  });
  assert.deepEqual(branding, {
    name: "NovaShop",
    logoUrl: "https://cdn.novashop.example/logo.svg",
    accent: "#0f766e",
  });
  assert.equal(tenantBrandingFromRecord({
    name: "Default Merchant",
    settings: { logoUrl: "javascript:alert(1)", accent: "red" },
  }).logoUrl, null);
});

test("persisted tenant settings surface on support branding", () => {
  const db = createDatabase(":memory:");
  try {
    const tenants = new TenantRepository(db);
    const tenant = tenants.ensureDefaultTenant();
    tenants.updateSettings(tenant.id, { brandName: "Harbor Goods", accent: "#c2410c" });
    assert.deepEqual(getSupportBranding(db), {
      name: "Harbor Goods",
      logoUrl: null,
      accent: "#c2410c",
    });
  } finally {
    db.close();
  }
});

test("escalation workspace card and SSE outcome both expose a human handoff", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    const runId = new AgentRunRepository(db).create({ model: "test-model", inputText: "I want a person." });
    new SupportEscalationRepository(db).createOrGet({
      runId,
      customerId: "cus_001",
      orderId: "ord_8901",
      reasonCode: "CUSTOMER_REQUEST",
      summary: "Customer asked to speak with a person.",
      priority: "HIGH",
    });
    new SupportSessionRepository(db).appendMessage({
      sessionId: created.session.id,
      runId,
      role: "CUSTOMER",
      content: "Can I talk to someone?",
    });

    const detail = await getSupportSessionDetail(db, created.session.id);
    assert.equal(detail.workspace.escalation?.priority, "HIGH");
    assert.match(detail.workspace.escalation?.ticketNumber ?? "", /^ESC-/);
    assert.match(detail.workspace.escalation?.slaMessage ?? "", /2 hours/);

    const outcome = supportOutcomeFromEvent({
      id: "evt_esc",
      runId,
      sequence: 1,
      type: "ESCALATION",
      status: "WARNING",
      title: "Support request escalated to a human",
      toolName: "escalate_to_human",
      callId: null,
      durationMs: null,
      metadata: { escalationId: detail.workspace.escalation?.id, reasonCode: "CUSTOMER_REQUEST", priority: "HIGH", status: "OPEN" },
      createdAt: "2026-08-20T12:00:00Z",
    } satisfies PersistedAgentEvent);
    assert.equal(outcome?.kind, "ESCALATED");
  } finally {
    db.close();
  }
});

test("a new support session does not inherit another session's escalation for the same order", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const first = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    const runId = new AgentRunRepository(db).create({ model: "test-model", inputText: "Escalate." });
    new SupportEscalationRepository(db).createOrGet({
      runId,
      customerId: "cus_001",
      orderId: "ord_8901",
      reasonCode: "CUSTOMER_REQUEST",
      summary: "Previous session asked for a human.",
      priority: "NORMAL",
    });
    new SupportSessionRepository(db).appendMessage({
      sessionId: first.session.id,
      runId,
      role: "CUSTOMER",
      content: "Can I talk to someone?",
    });
    assert.ok((await getSupportSessionDetail(db, first.session.id)).workspace.escalation);

    const second = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    assert.equal(second.workspace.escalation, null);
  } finally {
    db.close();
  }
});
