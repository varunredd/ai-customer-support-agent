import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { REFUND_POLICY } from "@/domain/refunds/policy";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Refund Policy"
          description="Machine-checkable rules the LLM must invoke. The model never decides eligibility from prose."
        />

        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Active rules</h2>
                <p className="panel-subtitle">Version {REFUND_POLICY.version} · {REFUND_POLICY.refundWindowDays}-day return window.</p>
              </div>
              <StatusBadge status="SUCCESS">ENFORCED</StatusBadge>
            </div>
            <div className={styles.rules}>
              {REFUND_POLICY.rules.map((rule) => (
                <article key={rule.code} className={styles.rule}>
                  <span className={styles.code}>{rule.code}</span>
                  <div>
                    <h3 className={styles.title}>{rule.title}</h3>
                    <p className={styles.text}>{rule.text}</p>
                  </div>
                  <StatusBadge status="SUCCESS">ACTIVE</StatusBadge>
                </article>
              ))}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Engine contract</h2>
            </div>
            <div className={`panel-body ${styles.meta}`}>
              <div className={styles.metaItem}>
                <span>Authority</span>
                <strong>Deterministic service</strong>
              </div>
              <div className={styles.metaItem}>
                <span>LLM role</span>
                <strong>Tool caller only</strong>
              </div>
              <div className={styles.metaItem}>
                <span>Window</span>
                <strong>{REFUND_POLICY.refundWindowDays} days after delivery</strong>
              </div>
              <div className={styles.metaItem}>
                <span>Shipping</span>
                <strong>Excluded from auto-refunds</strong>
              </div>
              <div className={styles.metaItem}>
                <span>High-risk accounts</span>
                <strong>Manual review</strong>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
