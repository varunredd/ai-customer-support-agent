import { ShieldCheck } from "lucide-react";
import styles from "./SupportSetupPanel.module.css";

export function SupportPortalPanel({ merchantName }: { merchantName?: string }) {
  const storeName = merchantName?.trim() || "this store";
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">How support starts</p>
        <h3 className={styles.name}>Choose an order</h3>
        <p className={styles.meta}>
          {storeName} matches your email to customer-owned orders. You pick the order; the agent cannot switch accounts later.
        </p>
      </section>

      <section className={styles.section}>
        <p className="eyebrow">What the agent can do</p>
        <ol className={styles.steps}>
          <li>Read the matched customer and order</li>
          <li>Apply the published refund policy</li>
          <li>Record an approved refund, queue manager review, or explain a denial</li>
        </ol>
      </section>

      <div className={styles.note}>
        <ShieldCheck size={16} />
        <div>
          <strong>Identity stays bound</strong>
          <span>After the session starts, the agent cannot switch to a different customer or order.</span>
        </div>
      </div>
    </div>
  );
}
