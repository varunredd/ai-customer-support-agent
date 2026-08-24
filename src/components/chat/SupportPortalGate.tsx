"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PortalOrderLookup } from "@/domain/support/types";
import { formatDate, formatMoney } from "@/lib/format";
import styles from "./SupportSessionSetup.module.css";

interface SupportPortalGateProps {
  onStart: (input: { email: string; orderId: string }) => Promise<void>;
  isStarting: boolean;
  sessionError?: string | null;
  merchantName?: string;
}

export function SupportPortalGate({
  onStart,
  isStarting,
  sessionError = null,
  merchantName,
}: SupportPortalGateProps) {
  const [email, setEmail] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<PortalOrderLookup | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const storeName = merchantName?.trim() || "the store";
  const busy = isStarting || isLookingUp;
  const error = lookupError ?? sessionError;

  async function lookupOrders() {
    setIsLookingUp(true);
    setLookupError(null);
    try {
      const response = await fetch("/api/support/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as PortalOrderLookup & { error?: { message?: unknown } };
      if (!response.ok) {
        throw new Error(typeof payload.error?.message === "string" ? payload.error.message : "We could not find a matching order for that email.");
      }
      setLookup(payload);
      setSelectedOrderId(payload.orders.length === 1 ? payload.orders[0]?.id ?? null : null);
    } catch (caught) {
      setLookup(null);
      setSelectedOrderId(null);
      setLookupError(caught instanceof Error ? caught.message : "We could not find a matching order for that email.");
    } finally {
      setIsLookingUp(false);
    }
  }

  if (lookup) {
    return (
      <section className={styles.shell} aria-labelledby="support-session-title">
        <div className={styles.intro}>
          <h2 id="support-session-title">Choose an order</h2>
          <p>
            Hi {lookup.customerName.split(" ")[0]}. Pick the order you need help with. This chat stays locked to that order
            for the rest of the session.
          </p>
        </div>

        <div className={styles.orderList} role="listbox" aria-label="Your orders">
          {lookup.orders.map((order) => {
            const selected = selectedOrderId === order.id;
            return (
              <button
                key={order.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.orderCard} ${selected ? styles.orderCardSelected : ""}`}
                disabled={busy}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <span className={styles.orderCardIcon} aria-hidden="true">
                  <Package size={16} />
                </span>
                <span className={styles.orderCardBody}>
                  <strong>{order.itemNames[0] ?? "Order"}</strong>
                  <span>
                    Placed {formatDate(order.placedAt)} · {formatMoney(order.totalPaidCents, order.currency)}
                    {order.refundedCents > 0 ? ` · ${formatMoney(order.refundedCents, order.currency)} refunded` : ""}
                  </span>
                </span>
                <span className={styles.orderStatus}>{order.status.replaceAll("_", " ")}</span>
              </button>
            );
          })}
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setLookup(null);
              setSelectedOrderId(null);
              setLookupError(null);
            }}
          >
            <ArrowLeft size={16} />
            Different email
          </Button>
          <Button
            type="button"
            size="lg"
            className={styles.startButton}
            disabled={!selectedOrderId || busy}
            onClick={() => {
              if (!selectedOrderId) return;
              void onStart({ email, orderId: selectedOrderId });
            }}
          >
            {isStarting ? "Opening support…" : "Start support"}
            {!isStarting ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.shell} aria-labelledby="support-session-title">
      <div className={styles.intro}>
        <h2 id="support-session-title">Look up your order</h2>
        <p>
          Enter the email on your {storeName} account. We’ll list matching orders so you can start support without hunting
          for an order ID.
        </p>
      </div>

      <form
        className={styles.emailForm}
        onSubmit={(event) => {
          event.preventDefault();
          void lookupOrders();
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
            disabled={busy}
            required
          />
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button type="submit" size="lg" className={styles.startButton} disabled={!email.trim() || busy}>
            {isLookingUp ? "Finding orders…" : "Find my orders"}
            {!isLookingUp ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      </form>
    </section>
  );
}
