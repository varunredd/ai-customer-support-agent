import { PageHeader } from "@/components/layout/PageHeader";
import { PolicyManager } from "@/components/admin/PolicyManager";
import { getDatabase } from "@/db/database";
import { mergePolicyRulesWithCatalog, policyRulesNeedCatalogBackfill } from "@/domain/refunds/policy";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";

export const dynamic = "force-dynamic";

export default function PolicyPage() {
  const repository = new RefundPolicyRepository(getDatabase());
  const policies = repository.list().map((policy) => {
    if (policy.status === "ACTIVE" && policyRulesNeedCatalogBackfill(policy.rules)) {
      return { ...policy, rules: mergePolicyRulesWithCatalog(policy.rules) };
    }
    return policy;
  });
  const policy = policies.find((entry) => entry.status === "ACTIVE") ?? null;

  return (
    <div className="admin-page">
      <div className="admin-stack admin-stack-wide">
        <PageHeader title="Refund Policy" />
        <PolicyManager initialPolicy={policy} initialPolicies={policies} />
      </div>
    </div>
  );
}
