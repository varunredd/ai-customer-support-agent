import Link from "next/link";
import { Activity, CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { getDatabase } from "@/db/database";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { formatTime } from "@/lib/format";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import styles from "./overview.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AttentionRow {
  id: string;
  name: string;
  email: string;
  account_status: "ACTIVE" | "SUSPENDED";
  risk_level: "LOW" | "MEDIUM" | "HIGH";
}

export default function AdminOverviewPage() {
  const db = getDatabase();
  const read = new AdminReadRepository(db);
  const recentRuns = read.listRunSummaries(5);
  const customerCount = (db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count;
  const orderCount = (db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count;
  const suspended = (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE account_status = 'SUSPENDED'").get() as { count: number }).count;
  const highRisk = (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE risk_level = 'HIGH'").get() as { count: number }).count;
  const todayRuns = (db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE date(started_at) = date('now')").get() as { count: number }).count;
  const completedToday = (db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE date(started_at) = date('now') AND status = 'COMPLETED'").get() as { count: number }).count;
  const activePolicy = new RefundPolicyRepository(db).getActiveOrNull();
  const policyRuleCount = activePolicy?.rules.filter((rule) => rule.enabled).length ?? 0;
  const deniedCount = (db.prepare("SELECT COUNT(*) AS count FROM agent_events WHERE type = 'DECISION' AND status = 'FAILED'").get() as { count: number }).count;
  const attention = db
    .prepare("SELECT id, name, email, account_status, risk_level FROM customers WHERE risk_level = 'HIGH' OR account_status = 'SUSPENDED' ORDER BY name")
    .all() as AttentionRow[];

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Overview">
          <Link href="/support" className="primary-link">Open support</Link>
        </PageHeader>

        <div className="kpi-grid">
          <StatCard label="Customers" value={String(customerCount)} hint={`${suspended} suspended · ${highRisk} high risk`} icon={<Users size={16} />} />
          <StatCard label="Orders" value={String(orderCount)} hint="In Jobform" icon={<Activity size={16} />} />
          <StatCard label="Runs today" value={String(todayRuns)} hint={`${completedToday} done`} icon={<CheckCircle2 size={16} />} />
          <StatCard label="Policy" value={activePolicy ? `${policyRuleCount} rules` : "None"} hint={activePolicy ? `${deniedCount} denials` : "Create in Refund Policy"} tone={activePolicy ? "success" : "warning"} icon={<ShieldAlert size={16} />} />
        </div>

        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Recent runs</h2>
              <Link href="/admin/runs" className="table-link">View all</Link>
            </div>
            <table className="table">
              <thead><tr><th>Run</th><th>Customer</th><th>Order</th><th>Outcome</th><th>Started</th></tr></thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="mono text-strong">{run.id}</td>
                    <td className="text-strong">{run.customerName ?? run.customerId ?? "Pending"}</td>
                    <td className="mono">{run.orderId ?? "—"}</td>
                    <td>
                      <StatusBadge status={run.status === "FAILED" || run.decision === "DENY" ? "FAILED" : run.status === "IN_PROGRESS" ? "RUNNING" : "SUCCESS"}>
                        {run.status === "FAILED" ? "FAILED" : run.decision ?? run.status}
                      </StatusBadge>
                    </td>
                    <td>{formatTime(run.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentRuns.length === 0 ? <div className="state-container"><p className="state-description">No runs yet.</p></div> : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Needs attention</h2>
            </div>
            <div className={styles.attentionList}>
              {attention.map((customer) => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}`} className={styles.attentionItem}>
                  <div><strong>{customer.name}</strong><span>{customer.email}</span></div>
                  <div className={styles.attentionBadges}>
                    <StatusBadge status={customer.account_status === "ACTIVE" ? "SUCCESS" : "FAILED"}>{customer.account_status}</StatusBadge>
                    <StatusBadge status={customer.risk_level}>{customer.risk_level}</StatusBadge>
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
