import { ShieldCheck } from "lucide-react";
import styles from "./SupportSetupPanel.module.css";

export function SupportPortalPanel() {
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className="eyebrow">How support starts</p>
        <h3 className={styles.name}>Order lookup</h3>
        <p className={styles.meta}>Jobform matches the email and order ID to a customer-owned order before chat begins.</p>
      </section>

      <section className={styles.section}>
        <p className="eyebrow">What the agent can do</p>
        <ol className={styles.steps}>
          <li>Read the matched customer and order</li>
          <li>Apply the published refund policy</li>
          <li>Record an approved refund or explain a denial</li>
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
