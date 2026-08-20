"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { MonoId } from "@/components/ui/MonoId";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDurationMs, formatTime } from "@/lib/format";
import type { AdminRunSummary } from "@/repositories/admin-read.repository";

export default function FailedRunsPage() {
  const [runs, setRuns] = useState<AdminRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/runs?status=FAILED&limit=80", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load failed runs.");
        const payload = await response.json() as { runs: AdminRunSummary[] };
        setRuns(payload.runs);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load failed runs.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Failed runs"
          description="Agent runs that stopped before a completed reply. Open the timeline to see the last tool or model error."
        />
        {loading ? <LoadingState message="Loading…" /> : null}
        {error ? <ErrorState description={error} /> : null}
        {!loading && !error ? (
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Queue</h2>
              <span className="panel-subtitle">{runs.length} failed</span>
            </div>
            {runs.length ? (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Customer</th>
                      <th>Order</th>
                      <th>Error</th>
                      <th>Duration</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>{formatTime(run.startedAt)}</td>
                        <td className="text-strong">{run.customerName ?? run.customerId ?? "Unknown"}</td>
                        <td>{run.orderId ? <MonoId id={run.orderId} /> : "—"}</td>
                        <td>
                          <div>
                            <StatusBadge status="FAILED">{run.errorCode ?? "FAILED"}</StatusBadge>
                            <p className="panel-subtitle" style={{ marginTop: 6, maxWidth: 420 }}>
                              {run.errorMessage ?? "No error message stored."}
                            </p>
                          </div>
                        </td>
                        <td>{formatDurationMs(run.durationMs)}</td>
                        <td><Link className="table-link" href={`/admin/runs?run=${encodeURIComponent(run.id)}`}>Timeline</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No failed runs"
                description="When the agent hits a model, tool, or turn-limit failure, it will appear here."
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
