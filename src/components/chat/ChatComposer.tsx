"use client";

import React, { useState } from "react";
import { SendHorizontal } from "lucide-react";
import styles from "./ChatComposer.module.css";
import { Button } from "../ui/Button";

export function ChatComposer({ onSend }: { onSend: (msg: string) => void }) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSend(message);
    setMessage("");
  };

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <input
        type="text"
        className={styles.input}
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button type="submit" variant="primary" size="sm" className={styles.sendButton} disabled={!message.trim()}>
        <SendHorizontal size={16} />
      </Button>
    </form>
  );
}
