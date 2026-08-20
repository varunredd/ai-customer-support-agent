import Link from "next/link";
import { Activity, CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { getDatabase } from "@/db/database";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { formatMoney, formatTime } from "@/lib/format";
import { AdminReadRepository } from "@/repositories/admin-read.repository";
import { RefundApprovalRepository } from "@/repositories/refund-approval.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";
import styles from "./overview.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  const db = getDatabase();
  const tenantId = resolveTenantId(db);
  const read = new AdminReadRepository(db, tenantId);
  const recentRuns = read.listRunSummaries(5);
  const customerCount = (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = ?").get(tenantId) as { count: number }).count;
  const orderCount = (db.prepare("SELECT COUNT(*) AS count FROM orders WHERE tenant_id = ?").get(tenantId) as { count: number }).count;
  const suspended = (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = ? AND account_status = 'SUSPENDED'").get(tenantId) as { count: number }).count;
  const highRisk = (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = ? AND risk_level = 'HIGH'").get(tenantId) as { count: number }).count;
  const todayRuns = (db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE tenant_id = ? AND date(started_at) = date('now')").get(tenantId) as { count: number }).count;
  const completedToday = (db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE tenant_id = ? AND date(started_at) = date('now') AND status = 'COMPLETED'").get(tenantId) as { count: number }).count;
  const activePolicy = new RefundPolicyRepository(db, tenantId).getActiveOrNull();
  const policyRuleCount = activePolicy?.rules.filter((rule) => rule.enabled).length ?? 0;
  const deniedCount = (db.prepare(`SELECT COUNT(*) AS count
    FROM agent_events e
    JOIN agent_runs ar ON ar.id = e.run_id
    WHERE ar.tenant_id = ? AND e.type = 'DECISION' AND e.status = 'FAILED'`).get(tenantId) as { count: number }).count;
  const pendingApprovals = new RefundApprovalRepository(db, tenantId).listPending(8);
  const openEscalations = new SupportEscalationRepository(db, tenantId).listOpen(8);

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
              <Link href="/admin/approvals" className="table-link">Approvals</Link>
            </div>
            <div className={styles.attentionList}>
              {pendingApprovals.map((item) => (
                <Link key={item.id} href="/admin/approvals" className={styles.attentionItem}>
                  <div>
                    <strong>Refund approval · {formatMoney(item.amountCents)}</strong>
                    <span>{item.orderId} · {item.reason}</span>
                  </div>
                  <div className={styles.attentionBadges}>
                    <StatusBadge status="WARNING">PENDING</StatusBadge>
                  </div>
                </Link>
              ))}
              {openEscalations.map((item) => (
                <Link key={item.id} href="/admin/escalations" className={styles.attentionItem}>
                  <div>
                    <strong>Escalation · {item.reasonCode}</strong>
                    <span>{item.summary.slice(0, 80)}</span>
                  </div>
                  <div className={styles.attentionBadges}>
                    <StatusBadge status={item.priority === "HIGH" ? "HIGH" : "WARNING"}>{item.priority}</StatusBadge>
                    <StatusBadge status="WARNING">OPEN</StatusBadge>
                  </div>
                </Link>
              ))}
              {!pendingApprovals.length && !openEscalations.length ? (
                <div className="state-container"><p className="state-description">Nothing waiting on staff right now.</p></div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
