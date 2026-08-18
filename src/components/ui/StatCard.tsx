import clsx from "clsx";
import styles from "./StatCard.module.css";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}

export function StatCard({ label, value, hint, icon, tone = "default" }: StatCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
      </div>
      <div className={clsx(styles.value, tone !== "default" && styles[tone])}>{value}</div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </article>
  );
}
