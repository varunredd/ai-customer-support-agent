"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { MonoId } from "@/components/ui/MonoId";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatMoney, formatTime } from "@/lib/format";

interface RefundRow {
  id: string;
  runId: string | null;
  customerId: string;
  customerName: string;
  orderId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  amountCents: number;
  currency: "USD";
  status: "COMPLETED";
  policyVersion: string | null;
  createdAt: string;
}

export default function RefundsLedgerPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/refunds?limit=200", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load the refund ledger.");
        const payload = (await response.json()) as { refunds: RefundRow[] };
        setRefunds(payload.refunds);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load refunds.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return refunds;
    return refunds.filter((refund) =>
      [refund.id, refund.customerName, refund.customerId, refund.orderId, refund.itemName]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, refunds]);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Refunds Ledger" />

        <div className="toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              placeholder="Search refunds"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="filter-chip filter-chip-active" type="button">Completed</button>
        </div>

        <div className="panel">
          {loading ? <LoadingState message="Loading…" /> : error ? <ErrorState description={error} /> : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Refund</th>
                      <th>Order</th>
                      <th>Item</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Policy</th>
                      <th>Processed</th>
                      <th></th>
                    </tr>
                  </thead>
                  {visible.length > 0 ? (
                    <tbody>
                      {visible.map((refund) => (
                        <tr key={refund.id}>
                          <td className="text-strong">{refund.customerName}</td>
                          <td><MonoId id={refund.id} /></td>
                          <td><MonoId id={refund.orderId} /></td>
                          <td>{refund.itemName} · Qty {refund.quantity}</td>
                          <td className="numeric text-strong">{formatMoney(refund.amountCents)}</td>
                          <td><StatusBadge status="SUCCESS">COMPLETED</StatusBadge></td>
                          <td className="mono">{refund.policyVersion ?? "legacy"}</td>
                          <td>{formatTime(refund.createdAt)}</td>
                          <td className="actions">
                            {refund.runId ? (
                              <Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(refund.runId)}`}>Inspect</Link>
                            ) : (
                              <span className="muted">Seeded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ) : null}
                </table>
              </div>
              {visible.length === 0 ? (
                <EmptyState
                  title={refunds.length === 0 ? "No refunds yet" : "No matches"}
                  description={refunds.length === 0 ? "Approved refunds appear here." : "Try another search."}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
