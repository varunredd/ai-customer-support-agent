import styles from "./AmbientCanvas.module.css";

export function AmbientCanvas() {
  return (
    <div className={styles.ambient} aria-hidden="true">
      <div className={`${styles.orb} ${styles.orbA}`} />
      <div className={`${styles.orb} ${styles.orbB}`} />
      <div className={`${styles.orb} ${styles.orbC}`} />
      <svg className={styles.curves} viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
        <path
          d="M-80 640 C 220 210, 620 790, 1500 260"
          stroke="rgba(99, 102, 241, 0.14)"
          strokeWidth="88"
          strokeLinecap="round"
        />
        <path
          d="M-40 250 C 360 80, 780 420, 1480 120"
          stroke="rgba(47, 158, 148, 0.12)"
          strokeWidth="64"
          strokeLinecap="round"
        />
        <path
          d="M 80 820 C 480 540, 860 920, 1460 610"
          stroke="rgba(232, 176, 132, 0.16)"
          strokeWidth="54"
          strokeLinecap="round"
        />
        <path
          d="M-60 430 C 340 360, 700 180, 1520 470"
          stroke="rgba(255, 255, 255, 0.55)"
          strokeWidth="18"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
