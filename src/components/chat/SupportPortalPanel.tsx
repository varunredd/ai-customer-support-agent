import { ShieldCheck } from "lucide-react";
import styles from "./SupportSetupPanel.module.css";

export function SupportPortalPanel({ merchantName }: { merchantName?: string }) {
  const storeName = merchantName?.trim() || "this store";
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">How support starts</p>
        <h3 className={styles.name}>Find your order</h3>
        <p className={styles.meta}>
          {storeName} matches your email to orders you own. You choose the order; the agent cannot switch accounts later.
        </p>
      </section>

      <section className={styles.section}>
        <p className="eyebrow">What happens next</p>
        <ol className={styles.steps}>
          <li>Confirm the customer and order on file</li>
          <li>Apply the live refund policy checklist</li>
          <li>Approve a refund, send it for review, escalate, or explain a denial</li>
        </ol>
      </section>

      <div className={styles.note}>
        <ShieldCheck size={16} />
        <div>
          <strong>Identity stays bound</strong>
          <span>Once the session starts, the agent cannot jump to a different customer or order.</span>
        </div>
      </div>
    </div>
  );
}
