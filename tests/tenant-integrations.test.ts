import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { UserRepository } from "@/repositories/user.repository";
import { createAdminSessionToken } from "@/security/admin-session";
import { signIntegrationPayload } from "@/security/integration-signature";
import { decryptSecret, encryptSecret } from "@/security/secret-box";
import { requireStaffPermission } from "@/security/staff-authorization";
import { hashPassword } from "@/security/password";
import { drainOutboundWebhooks, enqueueOutboundWebhook } from "@/services/integrations/outbound-webhook.service";
import {
  getPublicIntegrationStatus,
  resolveCommerceCredentials,
  saveTenantIntegration,
  TenantIntegrationError,
} from "@/services/integrations/tenant-integration.service";
import { ensureDefaultTenant, resetTenantContextCache } from "@/services/tenant/tenant-context.service";

const OTHER_TENANT_ID = "ten_other";
const SESSION_SECRET = "admin-session-secret-for-product-tests-123456";
const COMMERCE_SECRET = "vault-commerce-secret-value-32chars!!";
const WEBHOOK_SECRET = "vault-webhook-secret-value-32chars!!";

const ENV_KEYS = [
  "ADMIN_SESSION_SECRET",
  "INTEGRATION_ENCRYPTION_KEY",
  "ECOMMERCE_BASE_URL",
  "BUSINESS_INTEGRATION_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

function sessionRequest(token: string) {
  return new Request("https://jobform.test/api/admin/integrations", {
    headers: { cookie: `jobform_admin=${encodeURIComponent(token)}` },
  });
}

function insertOtherTenant(db: ReturnType<typeof createDatabase>) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO tenants (id, name, slug, status, settings_json, created_at, updated_at)
    VALUES (?, 'Other Merchant', 'other', 'ACTIVE', '{}', ?, ?)`).run(OTHER_TENANT_ID, now, now);
}

test("secret box encrypts and decrypts with the session-secret fallback", () => {
  const previous = snapshotEnv();
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  try {
    const packed = encryptSecret("store-credential");
    assert.match(packed, /^v1\./);
    assert.equal(decryptSecret(packed), "store-credential");
    assert.notEqual(packed.includes("store-credential"), true);
  } finally {
    restoreEnv(previous);
  }
});

test("public integration status never returns plaintext secrets and isolates tenants", () => {
  const previous = snapshotEnv();
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  delete process.env.BUSINESS_INTEGRATION_SECRET;
  delete process.env.ECOMMERCE_BASE_URL;
  const db = createDatabase(":memory:");
  try {
    resetTenantContextCache();
    const tenantId = ensureDefaultTenant(db);
    insertOtherTenant(db);

    saveTenantIntegration(db, tenantId, {
      provider: "commerce",
      config: { baseUrl: "https://store.example.test" },
      secret: COMMERCE_SECRET,
    });
    saveTenantIntegration(db, tenantId, {
      provider: "webhook",
      config: { url: "https://hooks.example.test/jobform", events: ["refund.completed"] },
      secret: WEBHOOK_SECRET,
    });
    saveTenantIntegration(db, OTHER_TENANT_ID, {
      provider: "webhook",
      config: { url: "https://other.example.test/hooks", events: ["case.escalated"] },
      secret: "other-tenant-webhook-secret-32chars",
    });

    const status = getPublicIntegrationStatus(db, tenantId);
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes(COMMERCE_SECRET), false);
    assert.equal(serialized.includes(WEBHOOK_SECRET), false);
    assert.equal(serialized.includes("v1."), false);
    assert.equal(status.commerce.configured, true);
    assert.equal(status.commerce.hasSecret, true);
    assert.equal(status.commerce.source, "vault");
    assert.equal(status.webhooks.configured, true);
    assert.equal(status.webhooks.url, "https://hooks.example.test/jobform");
    assert.deepEqual(status.webhooks.events, ["refund.completed"]);

    const other = getPublicIntegrationStatus(db, OTHER_TENANT_ID);
    assert.equal(other.webhooks.url, "https://other.example.test/hooks");
    assert.equal(other.commerce.configured, false);
    assert.equal(other.commerce.source, "none");
    assert.equal(new AdminReadRepository(db, OTHER_TENANT_ID).getIntegrationStatus().webhooks.url, other.webhooks.url);
  } finally {
    restoreEnv(previous);
    db.close();
    closeDatabaseForTests();
    resetTenantContextCache();
  }
});

test("commerce credentials fall back to env when the vault is empty", () => {
  const previous = snapshotEnv();
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  process.env.ECOMMERCE_BASE_URL = "https://env-store.example.test";
  process.env.BUSINESS_INTEGRATION_SECRET = "env-fallback-secret-value-32chars";
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    const commerce = resolveCommerceCredentials(db, tenantId);
    assert.equal(commerce.configured, true);
    assert.equal(commerce.source, "env");
    assert.equal(commerce.baseUrl, "https://env-store.example.test");
    assert.equal(JSON.stringify(getPublicIntegrationStatus(db, tenantId)).includes("env-fallback-secret"), false);
  } finally {
    restoreEnv(previous);
    db.close();
    closeDatabaseForTests();
  }
});

test("outbound webhook drain posts a signed payload and ignores duplicate event keys", async () => {
  const previous = snapshotEnv();
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    saveTenantIntegration(db, tenantId, {
      provider: "webhook",
      config: { url: "https://hooks.example.test/jobform", events: ["refund.completed"] },
      secret: WEBHOOK_SECRET,
    });

    const first = enqueueOutboundWebhook(db, {
      eventType: "refund.completed",
      eventKey: "refund.completed:ref_test_1",
      tenantId,
      payload: { refundId: "ref_test_1" },
    });
    const duplicate = enqueueOutboundWebhook(db, {
      eventType: "refund.completed",
      eventKey: "refund.completed:ref_test_1",
      tenantId,
      payload: { refundId: "ref_test_1" },
    });
    assert.equal(first?.id, duplicate?.id);

    const calls: Array<{ url: string; headers: Headers; body: string }> = [];
    const drain = await drainOutboundWebhooks(db, {
      fetchImpl: (async (input, init) => {
        const headers = new Headers(init?.headers);
        const body = typeof init?.body === "string" ? init.body : "";
        calls.push({ url: String(input), headers, body });
        return new Response("ok", { status: 202 });
      }) as typeof fetch,
    });
    assert.equal(drain.sent, 1);
    assert.equal(drain.failed, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://hooks.example.test/jobform");
    assert.equal(calls[0]?.headers.get("x-jobform-event"), "refund.completed");
    const timestamp = calls[0]?.headers.get("x-jobform-timestamp") ?? "";
    const eventId = calls[0]?.headers.get("x-jobform-event-id") ?? "";
    const signature = calls[0]?.headers.get("x-jobform-signature") ?? "";
    const expected = signIntegrationPayload({
      secret: WEBHOOK_SECRET,
      timestamp,
      eventId,
      rawBody: calls[0]?.body ?? "",
    });
    assert.equal(signature, `sha256=${expected}`);

    const status = getPublicIntegrationStatus(db, tenantId);
    assert.equal(status.webhooks.deliveries[0]?.status, "SENT");
    assert.equal(status.webhooks.deliveries[0]?.responseStatus, 202);
  } finally {
    restoreEnv(previous);
    db.close();
    closeDatabaseForTests();
  }
});

test("viewers cannot manage integrations and weak secrets are rejected", () => {
  const previous = snapshotEnv();
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    assert.throws(
      () => saveTenantIntegration(db, tenantId, {
        provider: "webhook",
        config: { url: "https://hooks.example.test/jobform" },
        secret: "too-short",
      }),
      (error: unknown) => {
        assert.ok(error instanceof TenantIntegrationError);
        assert.equal(error.code, "INTEGRATION_SECRET_WEAK");
        return true;
      },
    );

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
    assert.equal(denied.status, 403);
  } finally {
    restoreEnv(previous);
    db.close();
    closeDatabaseForTests();
  }
});
