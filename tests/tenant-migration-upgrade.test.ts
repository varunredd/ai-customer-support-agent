import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateDatabase } from "@/db/database";
import { SCHEMA_VERSION } from "@/db/schema";
import { DEFAULT_TENANT_ID } from "@/domain/tenant/constants";

test("tenant migration succeeds when upgrading a pre-tenant schema with linked rows", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        account_status TEXT NOT NULL CHECK (account_status IN ('ACTIVE', 'SUSPENDED')),
        risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        lifetime_orders INTEGER NOT NULL CHECK (lifetime_orders >= 0),
        lifetime_refunds INTEGER NOT NULL CHECK (lifetime_refunds >= 0),
        created_at TEXT NOT NULL
      );
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
        currency TEXT NOT NULL CHECK (currency = 'USD'),
        subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
        shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
        tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
        total_paid_cents INTEGER NOT NULL CHECK (total_paid_cents >= 0),
        refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
        placed_at TEXT NOT NULL,
        delivered_at TEXT
      );
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        final_sale INTEGER NOT NULL CHECK (final_sale IN (0, 1)),
        refundable INTEGER NOT NULL CHECK (refundable IN (0, 1))
      );
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
        model TEXT NOT NULL,
        input_text TEXT NOT NULL,
        customer_id TEXT REFERENCES customers(id),
        order_id TEXT REFERENCES orders(id),
        final_output TEXT,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE agent_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        status TEXT,
        title TEXT NOT NULL,
        tool_name TEXT,
        call_id TEXT,
        duration_ms INTEGER,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );
      CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_fingerprint TEXT NOT NULL,
        run_id TEXT REFERENCES agent_runs(id),
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        item_id TEXT NOT NULL REFERENCES order_items(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        reason TEXT NOT NULL,
        condition TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        currency TEXT NOT NULL CHECK (currency = 'USD'),
        status TEXT NOT NULL CHECK (status = 'COMPLETED'),
        policy_version TEXT,
        evaluation_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE support_sessions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
        access_token_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE support_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES support_sessions(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(id),
        role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'AGENT')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE support_launch_tokens (
        jti TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT NOT NULL
      );
      CREATE TABLE refund_policy_versions (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
        refund_window_days INTEGER NOT NULL CHECK (refund_window_days > 0 AND refund_window_days <= 365),
        rules_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE UNIQUE INDEX idx_refund_policy_single_active
        ON refund_policy_versions(status) WHERE status = 'ACTIVE';
      CREATE TABLE notification_outbox (
        id TEXT PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'DEAD')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at TEXT NOT NULL,
        provider_message_id TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT
      );
      CREATE TABLE support_escalations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT REFERENCES orders(id),
        reason_code TEXT NOT NULL,
        summary TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('NORMAL', 'HIGH')),
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE operational_events (
        id TEXT PRIMARY KEY,
        severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'ERROR')),
        source TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        request_id TEXT,
        run_id TEXT REFERENCES agent_runs(id),
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE integration_events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        external_event_id TEXT NOT NULL UNIQUE,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PROCESSED', 'REJECTED')),
        error_code TEXT,
        created_at TEXT NOT NULL,
        processed_at TEXT NOT NULL
      );
      CREATE TABLE request_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        window_started_at_ms INTEGER NOT NULL,
        request_count INTEGER NOT NULL CHECK (request_count >= 0),
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations(version, name, applied_at) VALUES
        (1, 'phase2_agent_persistence', datetime('now')),
        (2, 'phase3_support_conversations', datetime('now')),
        (3, 'production_foundation', datetime('now'));
    `);

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO customers (
      id, name, email, account_status, risk_level, lifetime_orders, lifetime_refunds, created_at
    ) VALUES (?, 'Ada', 'ada@example.com', 'ACTIVE', 'LOW', 1, 0, ?)`).run("cus_legacy", now);
    db.prepare(`INSERT INTO orders (
      id, customer_id, status, currency, subtotal_cents, shipping_cents, tax_cents,
      total_paid_cents, refunded_cents, placed_at, delivered_at
    ) VALUES (?, ?, 'DELIVERED', 'USD', 1000, 0, 0, 1000, 0, ?, ?)`).run("ord_legacy", "cus_legacy", now, now);
    db.prepare(`INSERT INTO order_items (
      id, order_id, sku, name, quantity, unit_price_cents, final_sale, refundable
    ) VALUES (?, ?, 'SKU', 'Item', 1, 1000, 0, 1)`).run("item_legacy", "ord_legacy");
    db.prepare(`INSERT INTO refunds (
      id, idempotency_key, request_fingerprint, run_id, customer_id, order_id, item_id,
      quantity, reason, condition, amount_cents, currency, status, evaluation_json, created_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, 1, 'CHANGED_MIND', 'UNOPENED', 1000, 'USD', 'COMPLETED', '{}', ?)`)
      .run("ref_legacy", "legacy-key", "fp", "cus_legacy", "ord_legacy", "item_legacy", now);

    assert.doesNotThrow(() => migrateDatabase(db));

    const version = (db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version;
    assert.equal(version, SCHEMA_VERSION);
    assert.equal(
      (db.prepare("SELECT tenant_id FROM customers WHERE id = ?").get("cus_legacy") as { tenant_id: string }).tenant_id,
      DEFAULT_TENANT_ID,
    );
    assert.equal(
      (db.prepare("SELECT tenant_id FROM refunds WHERE id = ?").get("ref_legacy") as { tenant_id: string }).tenant_id,
      DEFAULT_TENANT_ID,
    );
  } finally {
    db.close();
  }
});
