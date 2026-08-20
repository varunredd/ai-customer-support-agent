import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabaseForTests, createDatabase } from "@/db/database";
import { catalogRuleTemplates } from "@/domain/refunds/policy";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import {
  nextDraftVersionLabel,
  validatePolicyForPublish,
} from "@/services/policy/policy-lifecycle.service";

test("policy validation requires at least one enabled rule", () => {
  const result = validatePolicyForPublish({
    version: "v1",
    refundWindowDays: 30,
    rules: catalogRuleTemplates().map((rule) => ({ ...rule, enabled: false })),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /at least one/i);
});

test("draft publish archives the previous active policy", () => {
  const db = createDatabase(":memory:");
  try {
    const repository = new RefundPolicyRepository(db);
    const first = repository.createDraft({
      version: "policy-v1",
      refundWindowDays: 30,
      rules: catalogRuleTemplates({ enableCore: true }),
    });
    const live = repository.publish(first.id);
    assert.equal(live.status, "ACTIVE");

    const second = repository.createDraft({
      version: "policy-v2",
      refundWindowDays: 14,
      sourcePolicyId: live.id,
    });
    const validation = validatePolicyForPublish(second);
    assert.equal(validation.ok, true);

    const published = repository.publish(second.id);
    assert.equal(published.status, "ACTIVE");
    assert.equal(published.refundWindowDays, 14);

    const versions = repository.list();
    assert.equal(versions.filter((policy) => policy.status === "ACTIVE").length, 1);
    const archived = versions.find((policy) => policy.id === live.id);
    assert.equal(archived?.status, "ARCHIVED");
  } finally {
    db.close();
    closeDatabaseForTests();
  }
});

test("next draft version labels stay unique", () => {
  const stamp = new Date().toISOString().slice(0, 10);
  assert.equal(nextDraftVersionLabel([]), `draft-${stamp}`);
  assert.equal(nextDraftVersionLabel([`draft-${stamp}`]), `draft-${stamp}-2`);
});
