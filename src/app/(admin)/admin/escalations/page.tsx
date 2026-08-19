import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDatabase } from "@/db/database";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";

export const dynamic = "force-dynamic";

export default function EscalationsPage() {
  const escalations = new SupportEscalationRepository(getDatabase()).listRecent(100);
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Human Escalations"
          description="Durable handoffs for requests that should not be resolved autonomously. Customers should never need to repeat the full context."
        />
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Escalation queue</h2>
              <p className="panel-subtitle">High-risk, unsupported, failed, or customer-requested handoffs.</p>
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Created</th><th>Priority</th><th>Reason</th><th>Customer</th><th>Order</th><th>Status</th><th>Run</th></tr></thead>
              <tbody>
                {escalations.length ? escalations.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td><StatusBadge status={item.priority === "HIGH" ? "HIGH" : "NEUTRAL"}>{item.priority}</StatusBadge></td>
                    <td><code>{item.reasonCode}</code></td>
                    <td className="mono">{item.customerId}</td>
                    <td className="mono">{item.orderId ?? "—"}</td>
                    <td><StatusBadge status={item.status === "OPEN" ? "WARNING" : "SUCCESS"}>{item.status}</StatusBadge></td>
                    <td><Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(item.runId)}`}>Inspect</Link></td>
                  </tr>
                )) : <tr><td colSpan={7}>No support escalations yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
