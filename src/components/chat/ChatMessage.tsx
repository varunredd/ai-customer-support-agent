import clsx from "clsx";
import { LoaderCircle, Volume2 } from "lucide-react";
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  role: "customer" | "agent";
  content: string;
  timestamp?: string;
  onSpeak?: () => void;
  speaking?: boolean;
  voicePhase?: "idle" | "generating" | "playing";
}

export function ChatMessage({ role, content, timestamp, onSpeak, speaking = false, voicePhase = "idle" }: ChatMessageProps) {
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
          {isAgent && onSpeak ? (
            <button
              type="button"
              className={styles.speakButton}
              onClick={onSpeak}
              disabled={speaking}
              aria-label="Play this response with the AI-generated support voice"
              title="Play AI-generated voice"
            >
              {speaking ? <LoaderCircle size={13} className={styles.spin} /> : <Volume2 size={13} />}
              <span>{voicePhase === "generating" ? "Preparing voice" : speaking ? "Playing" : "Listen"}</span>
            </button>
          ) : null}
        </div>
        <div className={clsx(styles.bubble, isAgent ? styles.agentBubble : styles.customerBubble)}>
          {content}
        </div>
      </div>
    </div>
  );
}
