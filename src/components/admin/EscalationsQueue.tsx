"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonoId } from "@/components/ui/MonoId";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatTime } from "@/lib/format";
import type { SupportEscalation } from "@/repositories/support-escalation.repository";

export function EscalationsQueue() {
  const [escalations, setEscalations] = useState<SupportEscalation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/escalations", { cache: "no-store" });
      const payload = await response.json() as { escalations?: SupportEscalation[]; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load escalations.");
      setEscalations(payload.escalations ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load escalations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(escalationId: string) {
    setBusyId(escalationId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalationId, action: "resolve", notes: notes[escalationId] }),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to resolve escalation.");
      setMessage("Escalation resolved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to resolve escalation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Escalations" description="Human handoffs from support chat. Resolve them here when staff have taken over." />
        {message ? <p className="panel-subtitle">{message}</p> : null}
        {error ? <p className="panel-subtitle" style={{ color: "var(--error)" }}>{error}</p> : null}

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Queue</h2>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8}>Loading escalations…</td></tr>
                ) : escalations.length ? escalations.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.createdAt)}</td>
                    <td><StatusBadge status={item.priority === "HIGH" ? "HIGH" : "NEUTRAL"}>{item.priority}</StatusBadge></td>
                    <td><code>{item.reasonCode}</code></td>
                    <td><MonoId id={item.customerId} /></td>
                    <td>{item.orderId ? <MonoId id={item.orderId} /> : "—"}</td>
                    <td><StatusBadge status={item.status === "OPEN" ? "WARNING" : "SUCCESS"}>{item.status}</StatusBadge></td>
                    <td>
                      {item.status === "OPEN" ? (
                        <input
                          className="field-input field-input-sm"
                          placeholder="Resolution note"
                          value={notes[item.id] ?? item.notes ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                        />
                      ) : (item.notes || "—")}
                    </td>
                    <td className="actions">
                      <Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(item.runId)}`}>Inspect</Link>
                      {item.status === "OPEN" ? (
                        <>
                          {" "}
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busyId === item.id}
                            onClick={() => void resolve(item.id)}
                          >
                            Resolve
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8}>No support escalations yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
