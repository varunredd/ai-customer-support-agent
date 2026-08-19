import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDatabase } from "@/db/database";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function PolicyPage() {
  const repository = new RefundPolicyRepository(getDatabase());
  const active = repository.ensureDefault();
  const policies = repository.list();
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Refund Policy" description="Versioned machine-checkable policy. Published versions are loaded at runtime by both validation and execution." />
        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div><h2 className="panel-title">Active rules</h2><p className="panel-subtitle">Version {active.version} · {active.refundWindowDays}-day return window.</p></div>
              <StatusBadge status="SUCCESS">ENFORCED</StatusBadge>
            </div>
            <div className={styles.rules}>
              {active.rules.map((rule) => <article key={rule.code} className={styles.rule}><span className={styles.code}>{rule.code}</span><div><h3 className={styles.title}>{rule.title}</h3><p className={styles.text}>{rule.text}</p></div><StatusBadge status="SUCCESS">ACTIVE</StatusBadge></article>)}
            </div>
          </section>
          <aside className="panel">
            <div className="panel-header"><h2 className="panel-title">Policy lifecycle</h2></div>
            <div className={`panel-body ${styles.meta}`}>
              <div className={styles.metaItem}><span>Authority</span><strong>Deterministic service</strong></div>
              <div className={styles.metaItem}><span>Active version</span><strong>{active.version}</strong></div>
              <div className={styles.metaItem}><span>Window</span><strong>{active.refundWindowDays} days</strong></div>
              <div className={styles.metaItem}><span>Versions</span><strong>{policies.length}</strong></div>
              <div className={styles.metaItem}><span>Publishing</span><strong>Staff console / API</strong></div>
            </div>
          </aside>
        </div>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Version history</h2><p className="panel-subtitle">Create drafts and publish through the protected policy API. The previous active version is archived atomically.</p></div></div>
          <div style={{ overflowX: "auto" }}><table className="table"><thead><tr><th>Version</th><th>Status</th><th>Window</th><th>Created</th><th>Published</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.id}><td><code>{policy.version}</code></td><td><StatusBadge status={policy.status === "ACTIVE" ? "SUCCESS" : policy.status === "DRAFT" ? "WARNING" : "NEUTRAL"}>{policy.status}</StatusBadge></td><td>{policy.refundWindowDays} days</td><td>{new Date(policy.createdAt).toLocaleString()}</td><td>{policy.publishedAt ? new Date(policy.publishedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </div>
  );
}
