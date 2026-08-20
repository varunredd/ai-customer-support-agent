import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { seedActiveTestPolicy } from "./helpers/seed-policy";
import { executeRefundAtomically, approveRefundApproval, rejectRefundApproval } from "@/services/refund-execution.service";
import { RefundApprovalRepository } from "@/repositories/refund-approval.repository";

test("policy-approved refunds above auto threshold queue for manager approval", () => {
  const previous = process.env.AUTO_APPROVE_MAX_CENTS;
  process.env.AUTO_APPROVE_MAX_CENTS = "5000";
  const db = createDatabase(":memory:");
  try {
    seedCatalog(db);
    seedActiveTestPolicy(db);
    const result = executeRefundAtomically(db, {
      idempotencyKey: "idem-hitl-1",
      runId: "run_hitl_1",
      request: {
        customerId: "cus_001",
        orderId: "ord_8901",
        itemId: "item_001",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: new Date().toISOString(),
      },
    });
    assert.equal(result.status, "PENDING_APPROVAL");
    assert.ok(result.approvalId);
    const pending = new RefundApprovalRepository(db).listPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, result.approvalId);

    const autoRefund = db.prepare("SELECT id FROM refunds WHERE idempotency_key = ?").get("idem-hitl-1");
    assert.equal(autoRefund, undefined);

    const approved = approveRefundApproval(db, result.approvalId!, "usr_manager");
    assert.equal(approved.status, "COMPLETED");
    assert.ok(approved.refund);
    assert.equal(new RefundApprovalRepository(db).findById(result.approvalId!)?.status, "APPROVED");
    const ledger = db.prepare("SELECT id FROM refunds WHERE idempotency_key = ?").get("idem-hitl-1");
    assert.ok(ledger);
  } finally {
    db.close();
    closeDatabaseForTests();
    if (previous === undefined) delete process.env.AUTO_APPROVE_MAX_CENTS;
    else process.env.AUTO_APPROVE_MAX_CENTS = previous;
  }
});

test("manager can reject a pending approval without writing a ledger row", () => {
  const previous = process.env.AUTO_APPROVE_MAX_CENTS;
  process.env.AUTO_APPROVE_MAX_CENTS = "1000";
  const db = createDatabase(":memory:");
  try {
    seedCatalog(db);
    seedActiveTestPolicy(db);
    const result = executeRefundAtomically(db, {
      idempotencyKey: "idem-hitl-reject",
      request: {
        customerId: "cus_001",
        orderId: "ord_8901",
        itemId: "item_001",
        quantity: 1,
        reason: "CHANGED_MIND",
        condition: "UNOPENED",
        requestedAt: new Date().toISOString(),
      },
    });
    assert.equal(result.status, "PENDING_APPROVAL");
    const rejected = rejectRefundApproval(db, result.approvalId!, "usr_manager", "Too large for this account");
    assert.equal(rejected.status, "REJECTED");
    const ledger = db.prepare("SELECT id FROM refunds WHERE idempotency_key = ?").get("idem-hitl-reject");
    assert.equal(ledger, undefined);
  } finally {
    db.close();
    closeDatabaseForTests();
    if (previous === undefined) delete process.env.AUTO_APPROVE_MAX_CENTS;
    else process.env.AUTO_APPROVE_MAX_CENTS = previous;
  }
});
