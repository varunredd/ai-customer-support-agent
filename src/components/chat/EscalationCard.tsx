import { Headset } from "lucide-react";
import type { SupportEscalationSummary } from "@/domain/support/types";
import styles from "./EscalationCard.module.css";

interface EscalationCardProps {
  escalation: SupportEscalationSummary;
}

export function EscalationCard({ escalation }: EscalationCardProps) {
  return (
    <section className={styles.card} aria-live="polite">
      <div className={styles.icon}>
        <Headset size={22} />
      </div>
      <div className={styles.content}>
        <span className={styles.kicker}>{escalation.status === "OPEN" ? "Human support" : "Escalation closed"}</span>
        <div className={styles.titleRow}>
          <h3>A specialist has this request</h3>
          <strong>{escalation.ticketNumber}</strong>
        </div>
        <p>{escalation.summary}</p>
        {escalation.status === "OPEN" ? <p>{escalation.slaMessage}</p> : null}
      </div>
    </section>
  );
}
