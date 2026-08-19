import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDatabase } from "@/db/database";
import { listOperationalEvents } from "@/lib/observability/system-logger";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";

export const dynamic = "force-dynamic";

function badge(severity: string) {
  if (severity === "ERROR") return "FAILED" as const;
  if (severity === "WARN") return "WARNING" as const;
  return "SUCCESS" as const;
}

export default function SystemPage() {
  const db = getDatabase();
  const events = listOperationalEvents(db, 80);
  const notifications = new NotificationOutboxRepository(db).listRecent(25);
  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="System" />
        <section className="panel">
          <div className="panel-header"><h2 className="panel-title">Events</h2></div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Time</th><th>Severity</th><th>Source</th><th>Code</th><th>Message</th></tr></thead>
              <tbody>{events.length ? events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td><StatusBadge status={badge(event.severity)}>{event.severity}</StatusBadge></td><td>{event.source}</td><td><code>{event.code}</code></td><td>{event.message}</td></tr>) : <tr><td colSpan={5}>No operational events yet.</td></tr>}</tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2 className="panel-title">Notifications</h2></div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Created</th><th>Type</th><th>Status</th><th>Attempts</th><th>Provider ID</th></tr></thead>
              <tbody>{notifications.length ? notifications.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.eventType}</td><td><StatusBadge status={item.status === "SENT" ? "SUCCESS" : item.status === "DEAD" ? "FAILED" : "WARNING"}>{item.status}</StatusBadge></td><td>{item.attempts}</td><td>{item.providerMessageId ?? "—"}</td></tr>) : <tr><td colSpan={5}>No notification events yet.</td></tr>}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
