import clsx from "clsx";
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  role: "customer" | "agent";
  content: string;
  timestamp?: string;
}

export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isAgent = role === "agent";

  return (
    <div className={clsx(styles.messageWrapper, isAgent ? styles.agentWrapper : styles.customerWrapper)}>
      <div className={clsx(styles.avatar, isAgent ? styles.agentAvatar : styles.customerAvatar)}>
        {isAgent ? "AI" : "C"}
      </div>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.author}>{isAgent ? "Support agent" : "Customer"}</span>
          {timestamp ? <span className={styles.time}>{timestamp}</span> : null}
        </div>
        <div className={clsx(styles.bubble, isAgent ? styles.agentBubble : styles.customerBubble)}>
          {content}
        </div>
      </div>
    </div>
  );
}
