import React from "react";
import styles from "./AgentActivityLog.module.css";
import clsx from "clsx";

interface AgentActivityLogProps {
  activity: string;
}

export function AgentActivityLog({ activity }: AgentActivityLogProps) {
  return (
    <div className={styles.logWrapper}>
      <span className={styles.dot}></span>
      <span className={styles.text}>{activity}</span>
    </div>
  );
}
