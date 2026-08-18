import Link from "next/link";
import { Activity, CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { customers } from "@/data/customers";
import { orders } from "@/data/orders";
import { agentRunsPreview } from "@/data/ui/agentRunPreview";
import { REFUND_POLICY } from "@/domain/refunds/policy";
import { formatTime } from "@/lib/format";
import styles from "./overview.module.css";

export default function AdminOverviewPage() {
  const highRisk = customers.filter((customer) => customer.riskLevel === "HIGH").length;
  const suspended = customers.filter((customer) => customer.accountStatus === "SUSPENDED").length;
  const completedRuns = agentRunsPreview.filter((run) => run.status === "COMPLETED").length;
  const deniedRuns = agentRunsPreview.filter((run) =>
    run.events.some((event) => event.type === "DECISION" && event.status === "FAILED"),
  ).length;
  const attention = customers.filter(
    (customer) => customer.riskLevel === "HIGH" || customer.accountStatus === "SUSPENDED",
  );

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Overview"
          description="Live operations snapshot for the policy-grounded support agent."
        >
          <Link href="/support" className="primary-link">
            Open support chat
          </Link>
        </PageHeader>

        <div className="kpi-grid">
          <StatCard
            label="Customers"
            value={String(customers.length)}
            hint={`${suspended} suspended · ${highRisk} high risk`}
            icon={<Users size={16} />}
          />
          <StatCard
            label="Orders in scope"
            value={String(orders.length)}
            hint="Demo fixtures reserved for walkthroughs"
            icon={<Activity size={16} />}
          />
          <StatCard
            label="Agent runs today"
            value={String(agentRunsPreview.length)}
            hint={`${completedRuns} completed`}
            icon={<CheckCircle2 size={16} />}
          />
          <StatCard
            label="Policy engine"
            value={`${REFUND_POLICY.rules.length} rules`}
            hint={`${deniedRuns} deterministic denials`}
            tone="success"
            icon={<ShieldAlert size={16} />}
          />
        </div>

        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Recent agent runs</h2>
                <p className="panel-subtitle">Every decision is auditable by tool call and rule code.</p>
              </div>
              <Link href="/admin/runs" className="table-link">View all</Link>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Outcome</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {agentRunsPreview.map((run) => {
                  const customer = customers.find((item) => item.id === run.customerId);
                  const decision = run.events.find((event) => event.type === "DECISION");
                  const denied = decision?.status === "FAILED";
                  return (
                    <tr key={run.id}>
                      <td className="mono text-strong">{run.id}</td>
                      <td className="text-strong">{customer?.name ?? run.customerId}</td>
                      <td className="mono">{run.orderId}</td>
                      <td>
                        <StatusBadge status={denied ? "FAILED" : "SUCCESS"}>
                          {denied ? "DENIED" : "APPROVED"}
                        </StatusBadge>
                      </td>
                      <td>{formatTime(run.startedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Needs attention</h2>
                <p className="panel-subtitle">Accounts that block automated refunds.</p>
              </div>
            </div>
            <div className={styles.attentionList}>
              {attention.map((customer) => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}`} className={styles.attentionItem}>
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{customer.email}</span>
                  </div>
                  <div className={styles.attentionBadges}>
                    <StatusBadge status={customer.accountStatus === "ACTIVE" ? "SUCCESS" : "FAILED"}>
                      {customer.accountStatus}
                    </StatusBadge>
                    <StatusBadge status={customer.riskLevel}>{customer.riskLevel}</StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
