import { PageHeader } from "@/components/layout/PageHeader";
import { PolicyManager } from "@/components/admin/PolicyManager";
import { getDatabase } from "@/db/database";
import { mergePolicyRulesWithCatalog, policyRulesNeedCatalogBackfill } from "@/domain/refunds/policy";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";

export const dynamic = "force-dynamic";

export default function PolicyPage() {
  const repository = new RefundPolicyRepository(getDatabase());
  repository.activatePendingDraft();
  let policy = repository.getActiveOrNull();
  if (policy && policyRulesNeedCatalogBackfill(policy.rules)) {
    policy = repository.updateActive({ rules: mergePolicyRulesWithCatalog(policy.rules) });
  }

  return (
    <div className="admin-page">
      <div className="admin-stack admin-stack-wide">
        <PageHeader title="Refund Policy" />
        <PolicyManager initialPolicy={policy} />
      </div>
    </div>
  );
}
