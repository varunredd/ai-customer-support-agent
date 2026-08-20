"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { MonoId } from "@/components/ui/MonoId";
import { formatTime } from "@/lib/format";
import type { AuditLogEntry } from "@/repositories/audit-log.repository";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/audit?limit=100", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load the audit log.");
        const payload = (await response.json()) as { events: AuditLogEntry[] };
        setEvents(payload.events);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load audit events.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Audit log" description="Policy publishes, team changes, approvals, and escalation updates." />
        <section className="panel">
          {loading ? <LoadingState message="Loading…" /> : error ? <ErrorState description={error} /> : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Resource</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  {events.length ? (
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td>{formatTime(event.createdAt)}</td>
                          <td>{event.actorEmail ?? "System"}</td>
                          <td className="mono">{event.action}</td>
                          <td>{event.resourceType.replaceAll("_", " ")}</td>
                          <td>{event.resourceId ? <MonoId id={event.resourceId} /> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  ) : null}
                </table>
              </div>
              {events.length === 0 ? (
                <EmptyState title="No audit events yet" description="Publishing a policy, changing team members, or resolving an escalation writes a row here." />
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
