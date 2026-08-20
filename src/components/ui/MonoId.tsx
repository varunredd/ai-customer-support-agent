"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { shortId } from "@/lib/format";
import styles from "./MonoId.module.css";

interface MonoIdProps {
  id: string;
  head?: number;
  copyable?: boolean;
  className?: string;
}

export function MonoId({ id, head = 10, copyable = true, className }: MonoIdProps) {
  const [copied, setCopied] = useState(false);
  const display = shortId(id, head);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be denied; full id remains in title.
    }
  }

  return (
    <span className={`${styles.root} ${className ?? ""}`.trim()} title={id}>
      <code className={styles.value}>{display}</code>
      {copyable ? (
        <button
          type="button"
          className={styles.copy}
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : `Copy ${id}`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      ) : null}
    </span>
  );
}
