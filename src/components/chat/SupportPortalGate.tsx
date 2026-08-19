"use client";

import { useState } from "react";
import { ArrowRight, Mail, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./SupportSessionSetup.module.css";

interface SupportPortalGateProps {
  onStart: (input: { email: string; orderId: string }) => Promise<void>;
  isStarting: boolean;
  sessionError?: string | null;
}

export function SupportPortalGate({
  onStart,
  isStarting,
  sessionError = null,
}: SupportPortalGateProps) {
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");

  return (
    <section className={styles.shell} aria-labelledby="support-session-title">
      <div className={styles.intro}>
        <h2 id="support-session-title">Look up your order</h2>
        <p>Enter the email on the order and the order ID. Support stays locked to that order for the rest of the session.</p>
      </div>

      <form
        className={styles.fields}
        onSubmit={(event) => {
          event.preventDefault();
          void onStart({ email, orderId });
        }}
      >
        <div className={styles.fieldGroup}>
          <label htmlFor="support-email" className={styles.label}>
            <Mail size={16} /> Email
          </label>
          <input
            id="support-email"
            className={styles.select}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={isStarting}
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="support-order" className={styles.label}>
            <ShoppingBag size={16} /> Order ID
          </label>
          <input
            id="support-order"
            className={styles.select}
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="ord_8901"
            disabled={isStarting}
            required
          />
        </div>

        {sessionError ? (
          <div className={styles.error} role="alert">
            <span>{sessionError}</span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="submit"
            size="lg"
            className={styles.startButton}
            disabled={!email.trim() || !orderId.trim() || isStarting}
          >
            {isStarting ? "Opening support…" : "Start support"}
            {!isStarting ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      </form>
    </section>
  );
}
