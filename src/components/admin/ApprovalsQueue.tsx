"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatMoney, formatTime } from "@/lib/format";

interface ApprovalRow {
  id: string;
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  amountCents: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  runId: string | null;
  createdAt: string;
  policyVersion: string | null;
}

export function ApprovalsQueue() {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/approvals", { cache: "no-store" });
      const payload = await response.json() as { approvals?: ApprovalRow[]; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load approvals.");
      setApprovals(payload.approvals ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approvalId: string, decision: "APPROVE" | "REJECT") {
    setBusyId(approvalId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to update approval.");
      setMessage(decision === "APPROVE" ? "Refund approved and recorded." : "Refund request rejected.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update approval.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Approvals" />
        {message ? <p className="panel-subtitle">{message}</p> : null}
        {error ? <p className="panel-subtitle" style={{ color: "var(--danger, #b42318)" }}>{error}</p> : null}

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Pending manager review</h2>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Run</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8}>Loading approvals…</td></tr>
                ) : approvals.length ? approvals.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.createdAt)}</td>
                    <td className="mono">{item.customerId}</td>
                    <td className="mono">{item.orderId}</td>
                    <td className="text-strong">{formatMoney(item.amountCents)}</td>
                    <td><code>{item.reason}</code></td>
                    <td><StatusBadge status="WARNING">{item.status}</StatusBadge></td>
                    <td>
                      {item.runId ? (
                        <Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(item.runId)}`}>Inspect</Link>
                      ) : "—"}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="filter-chip filter-chip-active"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item.id, "APPROVE")}
                      >
                        Approve
                      </button>{" "}
                      <button
                        type="button"
                        className="filter-chip"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item.id, "REJECT")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8}>No refunds waiting for manager approval.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
