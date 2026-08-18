export interface DatabaseMigration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: DatabaseMigration[] = [
  {
    version: 1,
    name: "phase2_agent_persistence",
    sql: `
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

      CREATE INDEX idx_orders_customer_id ON orders(customer_id);

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

      CREATE INDEX idx_order_items_order_id ON order_items(order_id);

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

      CREATE INDEX idx_agent_runs_started_at ON agent_runs(started_at DESC);

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

      CREATE INDEX idx_agent_events_run_id ON agent_events(run_id, sequence);

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
        evaluation_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_refunds_order_id ON refunds(order_id, created_at DESC);
      CREATE INDEX idx_refunds_customer_id ON refunds(customer_id, created_at DESC);
      CREATE INDEX idx_refunds_item_id ON refunds(item_id);
    `,
  },

  {
    version: 2,
    name: "phase3_support_conversations",
    sql: `
      CREATE TABLE support_sessions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_support_sessions_customer_id ON support_sessions(customer_id, updated_at DESC);
      CREATE INDEX idx_support_sessions_order_id ON support_sessions(order_id, updated_at DESC);

      CREATE TABLE support_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES support_sessions(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(id),
        role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'AGENT')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_support_messages_session_id ON support_messages(session_id, created_at);
      CREATE INDEX idx_support_messages_run_id ON support_messages(run_id);
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export const MIGRATION_TABLE_SQL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;
