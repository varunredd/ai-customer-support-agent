"use client";

import React, { useState } from "react";
import { Mic, SendHorizontal, Square } from "lucide-react";
import styles from "./ChatComposer.module.css";
import { Button } from "../ui/Button";

export type VoiceComposerState = "IDLE" | "CONNECTING" | "LISTENING" | "TRANSCRIBING" | "UNSUPPORTED" | "ERROR";

interface ChatComposerProps {
  onSend: (msg: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  voiceState?: VoiceComposerState;
  voicePreview?: string;
  voiceError?: string | null;
  onVoiceToggle?: () => void;
}

function voiceLabel(state: VoiceComposerState, preview?: string) {
  if (state === "CONNECTING") return "Connecting microphone…";
  if (state === "LISTENING") return "Listening… speak one support request.";
  if (state === "TRANSCRIBING") return preview?.trim() || "Transcribing your request…";
  if (state === "UNSUPPORTED") return "Microphone voice input is unavailable in this browser.";
  return null;
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  voiceState = "IDLE",
  voicePreview,
  voiceError,
  onVoiceToggle,
}: ChatComposerProps) {
  const [message, setMessage] = useState("");
  const voiceActive = voiceState === "CONNECTING" || voiceState === "LISTENING" || voiceState === "TRANSCRIBING";
  const status = voiceError || voiceLabel(voiceState, voicePreview);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled || voiceActive) return;
    const outgoing = message.trim();
    setMessage("");
    void onSend(outgoing);
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          placeholder={voiceActive ? "Voice input is active…" : placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={disabled || voiceActive}
          aria-label="Customer support message"
        />
        {onVoiceToggle ? (
          <button
            type="button"
            className={`${styles.voiceButton} ${voiceActive ? styles.voiceButtonActive : ""}`}
            onClick={onVoiceToggle}
            disabled={disabled || voiceState === "UNSUPPORTED"}
            aria-pressed={voiceActive}
            aria-label={voiceActive ? "Stop voice input" : "Speak support request"}
            title={voiceActive ? "Stop voice input" : "Speak with microphone"}
          >
            {voiceActive ? <Square size={15} /> : <Mic size={17} />}
          </button>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className={styles.sendButton}
          disabled={disabled || voiceActive || !message.trim()}
        >
          <SendHorizontal size={16} />
        </Button>
      </form>
      {status ? (
        <div className={`${styles.voiceStatus} ${voiceError ? styles.voiceStatusError : ""}`} role={voiceError ? "alert" : "status"}>
          <span className={voiceActive ? styles.pulse : styles.statusDot} />
          <span>{status}</span>
        </div>
      ) : null}
    </div>
  );
}
