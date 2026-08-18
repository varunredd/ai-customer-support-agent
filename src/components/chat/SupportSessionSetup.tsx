"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCcw, ShoppingBag, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";
import type { SupportCustomerOption, SupportOrderOption } from "@/domain/support/context";
import styles from "./SupportSessionSetup.module.css";

interface SupportSessionSetupProps {
  onStart: (input: { customerId: string; orderId: string }) => Promise<void>;
  onSelectionChange?: (selection: {
    customer: SupportCustomerOption | null;
    order: SupportOrderOption | null;
  }) => void;
  isStarting: boolean;
  sessionError?: string | null;
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

export function SupportSessionSetup({
  onStart,
  onSelectionChange,
  isStarting,
  sessionError = null,
}: SupportSessionSetupProps) {
  const [customers, setCustomers] = useState<SupportCustomerOption[]>([]);
  const [orders, setOrders] = useState<SupportOrderOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoadingCustomers(true);
        setError(null);
        const response = await fetch("/api/support/context", { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response, "Unable to load customers."));
        const payload = (await response.json()) as { customers: SupportCustomerOption[] };
        if (!active) return;
        setCustomers(payload.customers);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load customers.");
      } finally {
        if (active) setLoadingCustomers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!customerId) {
      setOrders([]);
      setOrderId("");
      return;
    }

    let active = true;
    void (async () => {
      try {
        setLoadingOrders(true);
        setError(null);
        const response = await fetch(`/api/support/context?customerId=${encodeURIComponent(customerId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await readError(response, "Unable to load this customer's orders."));
        const payload = (await response.json()) as { orders: SupportOrderOption[] };
        if (!active) return;
        setOrders(payload.orders);
        setOrderId(payload.orders[0]?.id ?? "");
      } catch (caught) {
        if (active) {
          setOrders([]);
          setOrderId("");
          setError(caught instanceof Error ? caught.message : "Unable to load this customer's orders.");
        }
      } finally {
        if (active) setLoadingOrders(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [customerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customerId, customers],
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === orderId) ?? null,
    [orderId, orders],
  );
  const displayError = error ?? sessionError;

  useEffect(() => {
    onSelectionChange?.({ customer: selectedCustomer, order: selectedOrder });
  }, [onSelectionChange, selectedCustomer, selectedOrder]);

  return (
    <section className={styles.shell} aria-labelledby="support-session-title">
      <div className={styles.intro}>
        <h2 id="support-session-title">Start a support session</h2>
        <p>Select a CRM customer and one of their orders. Chat stays locked to that pair for the rest of the session.</p>
      </div>

      <div className={styles.fields}>
        <div className={styles.fieldGroup}>
          <label htmlFor="support-customer" className={styles.label}>
            <UserRound size={16} /> Customer
          </label>
          <select
            id="support-customer"
            className={styles.select}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            disabled={loadingCustomers || isStarting}
          >
            <option value="">{loadingCustomers ? "Loading customers…" : "Choose a customer"}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.email}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="support-order" className={styles.label}>
            <ShoppingBag size={16} /> Order
          </label>
          <select
            id="support-order"
            className={styles.select}
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            disabled={!customerId || loadingOrders || isStarting}
          >
            <option value="">
              {!customerId ? "Choose a customer first" : loadingOrders ? "Loading orders…" : "Choose an order"}
            </option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.id} · {order.itemNames.join(", ")} · {formatMoney(order.totalPaidCents, order.currency)}
              </option>
            ))}
          </select>
          {customerId && !loadingOrders && orders.length === 0 ? (
            <p className={styles.fieldHint}>This customer has no seeded orders available for support.</p>
          ) : null}
        </div>
      </div>

      {displayError ? (
        <div className={styles.error} role="alert">
          <span>{displayError}</span>
          {error ? (
            <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCcw size={14} /> Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          size="lg"
          className={styles.startButton}
          disabled={!customerId || !orderId || isStarting || loadingCustomers || loadingOrders}
          onClick={() => void onStart({ customerId, orderId })}
        >
          {isStarting ? "Starting session…" : "Start support session"}
          {!isStarting ? <ArrowRight size={16} /> : null}
        </Button>
      </div>
    </section>
  );
}
