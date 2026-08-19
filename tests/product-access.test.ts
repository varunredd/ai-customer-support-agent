import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import {
  createAdminSessionToken,
  staffCredentialsConfigured,
  verifyAdminSessionToken,
  verifyStaffCredentials,
} from "@/security/admin-session";
import {
  assertSupportSessionAccess,
  hostEntryEnabled,
  portalEntryEnabled,
  SupportAccessError,
} from "@/security/support-access";
import { createPortalSupportSession, createSupportSession } from "@/services/support/support-session.service";

test("support entry defaults to portal and host together", () => {
  const previous = process.env.SUPPORT_ENTRY;
  try {
    delete process.env.SUPPORT_ENTRY;
    assert.equal(portalEntryEnabled(), true);
    assert.equal(hostEntryEnabled(), true);
    process.env.SUPPORT_ENTRY = "host";
    assert.equal(portalEntryEnabled(), false);
    assert.equal(hostEntryEnabled(), true);
    process.env.SUPPORT_ENTRY = "portal";
    assert.equal(portalEntryEnabled(), true);
    assert.equal(hostEntryEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.SUPPORT_ENTRY;
    else process.env.SUPPORT_ENTRY = previous;
  }
});

test("portal support starts from matching email and order ID and issues a session credential", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createPortalSupportSession(db, { email: "maya@example.com", orderId: "ord_8901" });
    assert.equal(created.detail.customer.id, "cus_001");
    assert.equal(created.detail.order.id, "ord_8901");
    assert.ok(created.accessToken.length >= 32);
    assert.doesNotThrow(() => assertSupportSessionAccess(
      db,
      created.detail.session.id,
      new Request("https://support.example.test/api/support/session", {
        headers: { Authorization: `Bearer ${created.accessToken}` },
      }),
    ));
  } finally {
    db.close();
  }
});

test("portal support rejects mismatched email and order without revealing which field failed", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    await assert.rejects(
      () => createPortalSupportSession(db, { email: "maya@example.com", orderId: "ord_8902" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /could not find a matching order/i);
        return true;
      },
    );
  } finally {
    db.close();
  }
});

test("support session APIs require a bearer credential even for catalog-created sessions", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const created = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    assert.throws(() => assertSupportSessionAccess(
      db,
      created.session.id,
      new Request("https://support.example.test/api/support/session"),
    ), (error: unknown) => {
      assert.ok(error instanceof SupportAccessError);
      assert.equal(error.code, "SUPPORT_SESSION_ACCESS_DENIED");
      return true;
    });
  } finally {
    db.close();
  }
});

test("staff credentials mint a verifiable admin session", () => {
  const previous = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.ADMIN_SESSION_SECRET,
  };
  process.env.ADMIN_EMAIL = "ops@jobform.example";
  process.env.ADMIN_PASSWORD = "launch-ready-pass";
  process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-product-tests-123456";
  try {
    assert.equal(staffCredentialsConfigured(), true);
    const email = verifyStaffCredentials("ops@jobform.example", "launch-ready-pass");
    const token = createAdminSessionToken(email);
    assert.equal(verifyAdminSessionToken(token)?.email, "ops@jobform.example");
    assert.equal(verifyAdminSessionToken("not-a-token"), null);
  } finally {
    if (previous.email === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous.email;
    if (previous.password === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous.password;
    if (previous.secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous.secret;
  }
});
