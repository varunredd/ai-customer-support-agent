import { PageHeader } from "@/components/layout/PageHeader";
import { PolicyManager } from "@/components/admin/PolicyManager";
import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";

export const dynamic = "force-dynamic";

export default function PolicyPage() {
  const repository = new RefundPolicyRepository(getDatabase());
  const policies = repository.list();
  const active = repository.getActiveOrNull();

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Refund Policy"
          description="Configure the machine-checkable rules that approve or deny refunds. Customer and order data sync from the e-commerce store."
        />
        <PolicyManager
          initialPolicies={policies}
          activePolicyId={active?.id ?? null}
        />
      </div>
    </div>
  );
}
