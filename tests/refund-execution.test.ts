import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { executeRefundAtomically, IdempotencyConflictError } from "@/services/refund-execution.service";

function setup() {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  return db;
}

test("atomic refund execution creates one ledger row and replays the exact persisted result", () => {
  const db = setup();
  try {
    const input = {
      idempotencyKey: "idem-approve-001",
      request: {
        customerId: "cus_001",
        orderId: "ord_8901",
        itemId: "item_001",
        quantity: 1,
        reason: "CHANGED_MIND" as const,
        condition: "UNOPENED" as const,
        requestedAt: "2026-08-18T12:00:00Z",
      },
    };

    const first = executeRefundAtomically(db, input);
    const second = executeRefundAtomically(db, {
      ...input,
      request: { ...input.request, requestedAt: "2026-08-18T12:00:05Z" },
    });

    assert.equal(first.status, "COMPLETED");
    assert.equal(first.idempotentReplay, false);
    assert.equal(second.status, "COMPLETED");
    assert.equal(second.idempotentReplay, true);
    assert.deepEqual(second.evaluation, first.evaluation);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM refunds WHERE order_id = ?").get("ord_8901") as { count: number }).count,
      1,
    );
    assert.equal(
      (db.prepare("SELECT refunded_cents FROM orders WHERE id = ?").get("ord_8901") as { refunded_cents: number })
        .refunded_cents,
      8900,
    );
    assert.equal(
      (db.prepare("SELECT lifetime_refunds FROM customers WHERE id = ?").get("cus_001") as { lifetime_refunds: number })
        .lifetime_refunds,
      2,
    );
  } finally {
    db.close();
  }
});

test("same idempotency key cannot be reused for different money intent", () => {
  const db = setup();
  try {
    const base = {
      customerId: "cus_001",
      orderId: "ord_8901",
      itemId: "item_001",
      quantity: 1,
      reason: "CHANGED_MIND" as const,
      condition: "UNOPENED" as const,
      requestedAt: "2026-08-18T12:00:00Z",
    };
    executeRefundAtomically(db, { idempotencyKey: "idem-conflict", request: base });
    assert.throws(
      () =>
        executeRefundAtomically(db, {
          idempotencyKey: "idem-conflict",
          request: { ...base, reason: "WRONG_ITEM" as const },
        }),
      IdempotencyConflictError,
    );
  } finally {
    db.close();
  }
});

test("final-sale execution is denied and never writes money movement", () => {
  const db = setup();
  try {
    const result = executeRefundAtomically(db, {
      idempotencyKey: "idem-deny-final-sale",
      request: {
        customerId: "cus_002",
        orderId: "ord_8902",
        itemId: "item_002",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: "2026-08-18T12:00:00Z",
      },
    });
    assert.equal(result.status, "DENIED");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM refunds WHERE order_id = ?").get("ord_8902") as { count: number })
        .count,
      0,
    );
  } finally {
    db.close();
  }
});

test("item-level ledger prevents refunding more units than purchased", () => {
  const db = setup();
  try {
    const result = executeRefundAtomically(db, {
      idempotencyKey: "idem-partial-second-unit",
      request: {
        customerId: "cus_009",
        orderId: "ord_8906",
        itemId: "item_006",
        quantity: 2,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: "2026-08-18T12:00:00Z",
      },
    });
    assert.equal(result.status, "DENIED");
    assert.ok(result.evaluation.denialReasons.some((reason) => reason.startsWith("VALID_QUANTITY:")));
  } finally {
    db.close();
  }
});

test("re-seeding fixtures never resets mutable refund totals", () => {
  const db = setup();
  try {
    executeRefundAtomically(db, {
      idempotencyKey: "idem-seed-preserve",
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

    seedCatalog(db);

    assert.equal(
      (db.prepare("SELECT refunded_cents FROM orders WHERE id = ?").get("ord_8901") as { refunded_cents: number })
        .refunded_cents,
      8900,
    );
    assert.equal(
      (db.prepare("SELECT lifetime_refunds FROM customers WHERE id = ?").get("cus_001") as { lifetime_refunds: number })
        .lifetime_refunds,
      2,
    );
  } finally {
    db.close();
  }
});
