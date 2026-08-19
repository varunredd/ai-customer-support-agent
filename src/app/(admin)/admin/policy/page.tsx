import { PageHeader } from "@/components/layout/PageHeader";
import { PolicyManager } from "@/components/admin/PolicyManager";
import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";

export const dynamic = "force-dynamic";

export default function PolicyPage() {
  const repository = new RefundPolicyRepository(getDatabase());
  repository.activatePendingDraft();
  const policy = repository.getActiveOrNull();

  return (
    <div className="admin-page">
      <div className="admin-stack admin-stack-wide">
        <PageHeader
          title="Refund Policy"
          description="Choose which refund checks NovaShop enforces. Save when done — there is no separate publish step."
        />
        <PolicyManager initialPolicy={policy} />
      </div>
    </div>
  );
}
