import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { SupportOutcome } from "@/lib/support-outcome";
import { formatMoney } from "@/lib/format";
import styles from "./RefundOutcomeCard.module.css";

interface RefundOutcomeCardProps {
  outcome: SupportOutcome;
}

export function RefundOutcomeCard({ outcome }: RefundOutcomeCardProps) {
  const approved = outcome.kind === "APPROVED";
  const pending = outcome.kind === "PENDING_APPROVAL";
  return (
    <section
      className={`${styles.card} ${approved ? styles.approved : pending ? styles.pending : styles.denied}`}
      aria-live="polite"
    >
      <div className={styles.icon}>
        {approved ? <CheckCircle2 size={22} /> : pending ? <Clock3 size={22} /> : <XCircle size={22} />}
      </div>
      <div className={styles.content}>
        <span className={styles.kicker}>{pending ? "Awaiting review" : approved ? "Decision" : "Policy decision"}</span>
        <div className={styles.titleRow}>
          <h3>{outcome.title}</h3>
          {(approved || pending) && outcome.amountCents > 0 ? <strong>{formatMoney(outcome.amountCents)}</strong> : null}
        </div>
        <p>{outcome.description}</p>
        {outcome.kind === "APPROVED" && outcome.refundId ? (
          <span className={styles.reference}>Refund reference · {outcome.refundId}</span>
        ) : null}
        {outcome.kind === "PENDING_APPROVAL" && outcome.approvalId ? (
          <span className={styles.reference}>Approval reference · {outcome.approvalId}</span>
        ) : null}
      </div>
    </section>
  );
}
