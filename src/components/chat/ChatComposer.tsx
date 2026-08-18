"use client";

import React, { useState } from "react";
import { SendHorizontal } from "lucide-react";
import styles from "./ChatComposer.module.css";
import { Button } from "../ui/Button";

interface ChatComposerProps {
  onSend: (msg: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSend, disabled = false, placeholder = "Type a message..." }: ChatComposerProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    const outgoing = message.trim();
    setMessage("");
    void onSend(outgoing);
  };

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <input
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={disabled}
        aria-label="Customer support message"
      />
      <Button type="submit" variant="primary" size="sm" className={styles.sendButton} disabled={disabled || !message.trim()}>
        <SendHorizontal size={16} />
      </Button>
    </form>
  );
}
