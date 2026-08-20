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
import type { AdminDecisionItem, AdminDecisionOutcome } from "@/repositories/admin-read.repository";

function outcomeBadge(outcome: AdminDecisionOutcome) {
  if (outcome === "AUTO_APPROVED" || outcome === "MANUALLY_APPROVED") return "SUCCESS" as const;
  if (outcome === "REQUIRES_APPROVAL") return "WARNING" as const;
  if (outcome === "ESCALATED_TO_HUMAN") return "RUNNING" as const;
  return "FAILED" as const;
}

function outcomeLabel(outcome: AdminDecisionOutcome) {
  return outcome.replaceAll("_", " ");
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<AdminDecisionItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/decisions?limit=80", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load refund decisions.");
        const payload = (await response.json()) as { decisions: AdminDecisionItem[] };
        setDecisions(payload.decisions);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load decisions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return decisions;
    return decisions.filter((item) =>
      [item.customerName, item.customerId, item.orderId, item.outcome, item.policyVersion]
        .some((value) => (value ?? "").toLowerCase().includes(normalized)),
    );
  }, [query, decisions]);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Decisions" description="Refund outcomes with the policy version and approval state that produced them." />

        <div className="toolbar">
          <label className="search-field">
            <Search size={15} />
            <input placeholder="Search decisions" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className="panel">
          {loading ? <LoadingState message="Loading…" /> : error ? <ErrorState description={error} /> : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Order</th>
                      <th>Outcome</th>
                      <th>Amount</th>
                      <th>Policy</th>
                      <th>Approval</th>
                      <th>When</th>
                      <th></th>
                    </tr>
                  </thead>
                  {visible.length > 0 ? (
                    <tbody>
                      {visible.map((item) => (
                        <tr key={item.runId}>
                          <td className="text-strong">{item.customerName ?? "Unknown"}</td>
                          <td>{item.orderId ? <MonoId id={item.orderId} /> : "—"}</td>
                          <td><StatusBadge status={outcomeBadge(item.outcome)}>{outcomeLabel(item.outcome)}</StatusBadge></td>
                          <td className="numeric text-strong">
                            {item.refundAmountCents != null ? formatMoney(item.refundAmountCents) : "—"}
                          </td>
                          <td className="mono">{item.policyVersion ?? "—"}</td>
                          <td>{item.approvalStatus ?? "—"}</td>
                          <td>{formatTime(item.startedAt)}</td>
                          <td className="actions">
                            <Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(item.runId)}`}>Inspect</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ) : null}
                </table>
              </div>
              {visible.length === 0 ? (
                <EmptyState
                  title={decisions.length === 0 ? "No decisions yet" : "No matches"}
                  description={decisions.length === 0 ? "Agent refund decisions appear here after a support run." : "Try another search."}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
