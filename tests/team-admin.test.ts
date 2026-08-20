import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import {
  createAdminSessionToken,
  staffCredentialsConfigured,
} from "@/security/admin-session";
import { roleHasPermission } from "@/security/rbac";
import { requireStaffPermission } from "@/security/staff-authorization";
import { createTenantStaffUser, updateTenantStaffUser } from "@/services/auth/staff-user.service";
import { UserRepository } from "@/repositories/user.repository";
import { hashPassword } from "@/security/password";
import { ensureDefaultTenant } from "@/services/tenant/tenant-context.service";

function sessionRequest(token: string) {
  return new Request("https://jobform.test/api/admin/users", {
    headers: { cookie: `jobform_admin=${encodeURIComponent(token)}` },
  });
}

test("team management creates, lists, and updates tenant-scoped staff users", () => {
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
    const admin = createTenantStaffUser(db, tenantId, {
      email: "owner@jobform.example",
      password: "owner-pass-1234",
      role: "MERCHANT_ADMIN",
    });
    const agent = createTenantStaffUser(db, tenantId, {
      email: "agent@jobform.example",
      password: "agent-pass-1234",
      role: "SUPPORT_AGENT",
    });
    const users = new UserRepository(db).listByTenant(tenantId);
    assert.equal(users.length, 2);
    assert.equal(users.some((user) => user.id === agent.id), true);

    const updated = updateTenantStaffUser(db, tenantId, admin.id, agent.id, { role: "VIEWER" });
    assert.equal(updated.role, "VIEWER");

    assert.throws(
      () => updateTenantStaffUser(db, tenantId, admin.id, admin.id, { status: "DISABLED" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /disable your own account/i);
        return true;
      },
    );
  } finally {
    db.close();
    closeDatabaseForTests();
  }
});

test("permission guards reject viewers from team management APIs", () => {
  const previous = {
    secret: process.env.ADMIN_SESSION_SECRET,
  };
  process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-product-tests-123456";
  const db = createDatabase(":memory:");
  try {
    const tenantId = ensureDefaultTenant(db);
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
    const denied = requireStaffPermission(sessionRequest(token), "team:manage");
    assert.ok(denied instanceof Response);
    assert.equal((denied as Response).status, 403);
    assert.equal(roleHasPermission("VIEWER", "team:manage"), false);
    assert.equal(staffCredentialsConfigured(), false);
  } finally {
    db.close();
    closeDatabaseForTests();
    if (previous.secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous.secret;
  }
});
