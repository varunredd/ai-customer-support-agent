import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { DEFAULT_TENANT_ID } from "@/domain/tenant/constants";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { TenantRepository } from "@/repositories/tenant.repository";
import { createSqliteCustomerRepository } from "@/repositories/sqlite";
import { resetTenantContextCache } from "@/services/tenant/tenant-context.service";
import { catalogRuleTemplates } from "@/domain/refunds/policy";

const OTHER_TENANT_ID = "ten_other";

function insertOtherTenant(db: ReturnType<typeof createDatabase>) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO tenants (id, name, slug, status, settings_json, created_at, updated_at)
    VALUES (?, 'Other Merchant', 'other', 'ACTIVE', '{}', ?, ?)`).run(OTHER_TENANT_ID, now, now);
}

test("customer lookups are isolated by tenant_id", async () => {
  const db = createDatabase(":memory:");
  try {
    resetTenantContextCache();
    insertOtherTenant(db);

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_default", DEFAULT_TENANT_ID, "Shared Shopper", "shopper@example.com", now);
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_other", OTHER_TENANT_ID, "Other Shopper", "shopper@example.com", now);

    const defaultRepo = createSqliteCustomerRepository(db, DEFAULT_TENANT_ID);
    const otherRepo = createSqliteCustomerRepository(db, OTHER_TENANT_ID);

    assert.equal((await defaultRepo.findByEmail("shopper@example.com"))?.id, "cus_default");
    assert.equal((await otherRepo.findByEmail("shopper@example.com"))?.id, "cus_other");
    assert.equal(await defaultRepo.findById("cus_other"), null);
    assert.equal(await otherRepo.findById("cus_default"), null);
  } finally {
    db.close();
    resetTenantContextCache();
  }
});

test("refund policies are scoped to one active version per tenant", () => {
  const db = createDatabase(":memory:");
  try {
    resetTenantContextCache();
    insertOtherTenant(db);

    const defaultPolicies = new RefundPolicyRepository(db, DEFAULT_TENANT_ID);
    const otherPolicies = new RefundPolicyRepository(db, OTHER_TENANT_ID);

    const defaultDraft = defaultPolicies.createDraft({
      version: "default-policy",
      refundWindowDays: 30,
      rules: catalogRuleTemplates({ enableCore: true }),
    });
    defaultPolicies.publish(defaultDraft.id);

    const otherDraft = otherPolicies.createDraft({
      version: "other-policy",
      refundWindowDays: 14,
      rules: catalogRuleTemplates({ enableCore: true }),
    });
    otherPolicies.publish(otherDraft.id);

    assert.equal(defaultPolicies.getActive().version, "default-policy");
    assert.equal(otherPolicies.getActive().version, "other-policy");
    assert.equal(defaultPolicies.list().length, 1);
    assert.equal(otherPolicies.list().length, 1);
  } finally {
    db.close();
    resetTenantContextCache();
  }
});

test("refund idempotency keys are isolated per tenant", () => {
  const db = createDatabase(":memory:");
  try {
    resetTenantContextCache();
    insertOtherTenant(db);

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_default", DEFAULT_TENANT_ID, "Default", "default@example.com", now);
    db.prepare(`INSERT INTO customers (
      id, tenant_id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_other", OTHER_TENANT_ID, "Other", "other@example.com", now);

    for (const tenant of [DEFAULT_TENANT_ID, OTHER_TENANT_ID] as const) {
      const customerId = tenant === DEFAULT_TENANT_ID ? "cus_default" : "cus_other";
      const orderId = tenant === DEFAULT_TENANT_ID ? "ord_1" : "ord_2";
      const itemId = tenant === DEFAULT_TENANT_ID ? "item_1" : "item_2";
      db.prepare(`INSERT INTO orders (
        id, tenant_id, customer_id, status, currency, subtotal_cents, shipping_cents, tax_cents,
        total_paid_cents, refunded_cents, placed_at, delivered_at
      ) VALUES (?, ?, ?, 'DELIVERED', 'USD', 1000, 0, 0, 1000, 0, ?, ?)`).run(orderId, tenant, customerId, now, now);
      db.prepare(`INSERT INTO order_items (
        id, order_id, sku, name, quantity, unit_price_cents, final_sale, refundable
      ) VALUES (?, ?, 'SKU', 'Item', 1, 1000, 0, 1)`).run(itemId, orderId);
    }

    db.prepare(`INSERT INTO refunds (
      id, tenant_id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
      quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, 'CHANGED_MIND', 'UNOPENED', 1000, 'USD', 'COMPLETED', '{}', ?)`)
      .run("ref_default", DEFAULT_TENANT_ID, "shared-key", "fp-default", "cus_default", "ord_1", "item_1", now);
    db.prepare(`INSERT INTO refunds (
      id, tenant_id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
      quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, 'CHANGED_MIND', 'UNOPENED', 2000, 'USD', 'COMPLETED', '{}', ?)`)
      .run("ref_other", OTHER_TENANT_ID, "shared-key", "fp-other", "cus_other", "ord_2", "item_2", now);

    const defaultRow = db.prepare("SELECT id FROM refunds WHERE tenant_id = ? AND idempotency_key = ?").get(DEFAULT_TENANT_ID, "shared-key") as { id: string };
    const otherRow = db.prepare("SELECT id FROM refunds WHERE tenant_id = ? AND idempotency_key = ?").get(OTHER_TENANT_ID, "shared-key") as { id: string };
    assert.equal(defaultRow.id, "ref_default");
    assert.equal(otherRow.id, "ref_other");
  } finally {
    db.close();
    resetTenantContextCache();
  }
});

test("default tenant bootstrap is idempotent", () => {
  const db = createDatabase(":memory:");
  try {
    resetTenantContextCache();
    const repository = new TenantRepository(db);
    const first = repository.ensureDefaultTenant();
    const second = repository.ensureDefaultTenant();
    assert.equal(first.id, DEFAULT_TENANT_ID);
    assert.equal(second.id, DEFAULT_TENANT_ID);
    assert.equal(repository.listActive().length, 1);
  } finally {
    db.close();
    resetTenantContextCache();
  }
});
