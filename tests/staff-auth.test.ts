import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import {
  createAdminSessionToken,
  staffCredentialsConfigured,
  verifyAdminSessionToken,
} from "@/security/admin-session";
import { roleHasPermission } from "@/security/rbac";
import { authenticateStaffUser } from "@/services/auth/staff-auth.service";

test("staff users authenticate against persisted credentials and mint tenant-scoped sessions", () => {
  const previous = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.ADMIN_SESSION_SECRET,
  };
  process.env.ADMIN_EMAIL = "ops@jobform.example";
  process.env.ADMIN_PASSWORD = "launch-ready-pass";
  process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-product-tests-123456";
  const db = createDatabase(":memory:");
  try {
    assert.equal(staffCredentialsConfigured(), true);
    const user = authenticateStaffUser(db, "ops@jobform.example", "launch-ready-pass");
    assert.equal(user.role, "MERCHANT_ADMIN");
    assert.match(user.id, /^usr_/);
    const token = createAdminSessionToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });
    const session = verifyAdminSessionToken(token);
    assert.equal(session?.email, "ops@jobform.example");
    assert.equal(session?.role, "MERCHANT_ADMIN");
    assert.equal(verifyAdminSessionToken("not-a-token"), null);
    assert.throws(
      () => authenticateStaffUser(db, "ops@jobform.example", "wrong-password"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /incorrect/i);
        return true;
      },
    );
  } finally {
    db.close();
    closeDatabaseForTests();
    if (previous.email === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous.email;
    if (previous.password === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous.password;
    if (previous.secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous.secret;
  }
});

test("RBAC roles expose expected permission boundaries", () => {
  assert.equal(roleHasPermission("MERCHANT_ADMIN", "policy:publish"), true);
  assert.equal(roleHasPermission("VIEWER", "policy:publish"), false);
  assert.equal(roleHasPermission("SUPPORT_MANAGER", "refund:approve"), true);
  assert.equal(roleHasPermission("SUPPORT_AGENT", "refund:approve"), false);
});
