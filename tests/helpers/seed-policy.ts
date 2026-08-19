import type { AppDatabase } from "@/db/database";
import { catalogRuleTemplates } from "@/domain/refunds/policy";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";

export function seedActiveTestPolicy(db: AppDatabase, input?: { version?: string; refundWindowDays?: number }) {
  const repository = new RefundPolicyRepository(db);
  const existing = repository.getActiveOrNull();
  if (existing) return existing;
  const draft = repository.createDraft({
    version: input?.version ?? "test-policy",
    refundWindowDays: input?.refundWindowDays ?? 30,
    rules: catalogRuleTemplates({ enableCore: true }),
  });
  return repository.publish(draft.id);
}
