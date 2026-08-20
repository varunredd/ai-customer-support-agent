"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { OUTBOUND_WEBHOOK_EVENTS, type OutboundWebhookEvent } from "@/domain/integrations/types";
import { formatTime } from "@/lib/format";
import type { AdminIntegrationStatus } from "@/repositories/admin-read.repository";
import styles from "./page.module.css";

type DeliveryStatus = AdminIntegrationStatus["webhooks"]["deliveries"][number]["status"];

function sourceLabel(source: "vault" | "env" | "none") {
  if (source === "vault") return "Stored in the encrypted vault.";
  if (source === "env") return "Using environment fallback until you save a vault credential.";
  return "Not configured in the vault or environment.";
}

function deliveryBadge(status: DeliveryStatus): "SUCCESS" | "WARNING" | "FAILED" {
  if (status === "SENT") return "SUCCESS";
  if (status === "DEAD") return "FAILED";
  return "WARNING";
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<AdminIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [commerceUrl, setCommerceUrl] = useState("");
  const [commerceSecret, setCommerceSecret] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSecret, setEmailSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<OutboundWebhookEvent[]>([...OUTBOUND_WEBHOOK_EVENTS]);

  const applyStatus = useCallback((next: AdminIntegrationStatus) => {
    setIntegrations(next);
    setCommerceUrl(next.commerce.baseUrl ?? "");
    setEmailFrom(next.email.fromEmail ?? "");
    setWebhookUrl(next.webhooks.url ?? "");
    setWebhookEvents(next.webhooks.events.length ? next.webhooks.events : [...OUTBOUND_WEBHOOK_EVENTS]);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/integrations", { cache: "no-store" });
    const payload = await response.json() as { integrations?: AdminIntegrationStatus; error?: { message: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load integration status.");
    if (!payload.integrations) throw new Error("Unable to load integration status.");
    applyStatus(payload.integrations);
  }, [applyStatus]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load integrations.");
      }
    })();
  }, [load]);

  async function saveProvider(
    provider: "commerce" | "email" | "webhook",
    config: Record<string, unknown>,
    secret: string,
    clearSecret: () => void,
  ) {
    setBusy(provider);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          config,
          ...(secret.trim() ? { secret: secret.trim() } : {}),
        }),
      });
      const payload = await response.json() as { integrations?: AdminIntegrationStatus; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save integration.");
      if (!payload.integrations) throw new Error("Unable to save integration.");
      applyStatus(payload.integrations);
      clearSecret();
      setMessage(`${provider === "webhook" ? "Webhook" : provider === "email" ? "Email" : "Commerce"} settings saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save integration.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTestWebhook() {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/integrations", { method: "POST" });
      const payload = await response.json() as {
        integrations?: AdminIntegrationStatus;
        drain?: { processed: number; sent: number; failed: number };
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to send a test webhook.");
      if (payload.integrations) applyStatus(payload.integrations);
      const drain = payload.drain;
      setMessage(
        drain
          ? `Test event queued. ${drain.sent} delivered, ${drain.failed} failed.`
          : "Test event queued.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send a test webhook.");
    } finally {
      setBusy(null);
    }
  }

  function toggleEvent(event: OutboundWebhookEvent) {
    setWebhookEvents((current) => (
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event]
    ));
  }

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Integrations"
          description="Store commerce, email, and webhook credentials in the encrypted tenant vault. Secrets are never shown after save."
        />
        {!integrations && !error ? <LoadingState message="Loading…" /> : null}
        {message ? <p className="panel-subtitle">{message}</p> : null}
        {error ? <ErrorState description={error} /> : null}
        {integrations ? (
          <>
            <div className={styles.columns}>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Commerce</h2>
                    <p className="panel-subtitle">{sourceLabel(integrations.commerce.source)}</p>
                  </div>
                  <StatusBadge status={integrations.commerce.configured ? "SUCCESS" : "WARNING"}>
                    {integrations.commerce.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                  </StatusBadge>
                </div>
                <form
                  className="panel-body"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveProvider("commerce", { baseUrl: commerceUrl }, commerceSecret, () => setCommerceSecret(""));
                  }}
                >
                  <div className={styles.formStack}>
                    <label className="field">
                      <span className="field-label">Store base URL</span>
                      <input
                        className="field-input"
                        data-testid="commerce-base-url"
                        type="url"
                        value={commerceUrl}
                        onChange={(event) => setCommerceUrl(event.target.value)}
                        placeholder="https://store.example.com"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Shared secret</span>
                      <input
                        className="field-input"
                        data-testid="commerce-secret"
                        type="password"
                        autoComplete="new-password"
                        value={commerceSecret}
                        onChange={(event) => setCommerceSecret(event.target.value)}
                        placeholder={integrations.commerce.hasSecret ? "Leave blank to keep the current secret" : "At least 32 characters"}
                      />
                    </label>
                    <p className={styles.hint}>
                      Host {integrations.commerce.host ?? "not set"}
                      {integrations.commerce.lastEventAt
                        ? ` · last event ${formatTime(integrations.commerce.lastEventAt)} · ${integrations.commerce.lastEventStatus}`
                        : " · no events yet"}
                    </p>
                    <div className="toolbar">
                      <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                        Save commerce
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Email</h2>
                    <p className="panel-subtitle">{sourceLabel(integrations.email.source)}</p>
                  </div>
                  <StatusBadge status={integrations.email.configured ? "SUCCESS" : "WARNING"}>
                    {integrations.email.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                  </StatusBadge>
                </div>
                <form
                  className="panel-body"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveProvider("email", { fromEmail: emailFrom }, emailSecret, () => setEmailSecret(""));
                  }}
                >
                  <div className={styles.formStack}>
                    <label className="field">
                      <span className="field-label">From email</span>
                      <input
                        className="field-input"
                        data-testid="email-from"
                        type="email"
                        value={emailFrom}
                        onChange={(event) => setEmailFrom(event.target.value)}
                        placeholder="support@merchant.com"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Resend API key</span>
                      <input
                        className="field-input"
                        data-testid="email-secret"
                        type="password"
                        autoComplete="new-password"
                        value={emailSecret}
                        onChange={(event) => setEmailSecret(event.target.value)}
                        placeholder={integrations.email.hasSecret ? "Leave blank to keep the current key" : "At least 32 characters"}
                      />
                    </label>
                    <p className={styles.hint}>Delivery mode · {integrations.email.deliveryMode}</p>
                    <div className="toolbar">
                      <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                        Save email
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            </div>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Webhooks</h2>
                  <p className="panel-subtitle">Signed outbound events for refund.completed, case.escalated, approval.required, and agent.failed.</p>
                </div>
                <StatusBadge status={integrations.webhooks.configured ? "SUCCESS" : "WARNING"}>
                  {integrations.webhooks.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                </StatusBadge>
              </div>
              <form
                className="panel-body"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveProvider(
                    "webhook",
                    { url: webhookUrl, events: webhookEvents },
                    webhookSecret,
                    () => setWebhookSecret(""),
                  );
                }}
              >
                <div className={styles.formStack}>
                  <label className="field">
                    <span className="field-label">Destination URL</span>
                    <input
                      className="field-input"
                      data-testid="webhook-url"
                      type="url"
                      value={webhookUrl}
                      onChange={(event) => setWebhookUrl(event.target.value)}
                      placeholder="https://merchant.example/webhooks/jobform"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Signing secret</span>
                    <input
                      className="field-input"
                      data-testid="webhook-secret"
                      type="password"
                      autoComplete="new-password"
                      value={webhookSecret}
                      onChange={(event) => setWebhookSecret(event.target.value)}
                      placeholder={integrations.webhooks.hasSecret ? "Leave blank to keep the current secret" : "At least 32 characters"}
                    />
                  </label>
                  <fieldset className="field">
                    <legend className="field-label">Events</legend>
                    <div className={styles.checkGrid}>
                      {OUTBOUND_WEBHOOK_EVENTS.map((event) => (
                        <label key={event} className={styles.checkItem}>
                          <input
                            type="checkbox"
                            checked={webhookEvents.includes(event)}
                            onChange={() => toggleEvent(event)}
                          />
                          {event}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="toolbar">
                    <button type="submit" className="btn btn-primary" data-testid="save-webhook" disabled={busy !== null}>
                      Save webhook
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      data-testid="send-test-webhook"
                      disabled={busy !== null || !integrations.webhooks.configured}
                      onClick={() => void sendTestWebhook()}
                    >
                      Send test
                    </button>
                  </div>
                </div>
              </form>
            </section>

            <section className="panel" data-testid="webhook-deliveries">
              <div className="panel-header">
                <h2 className="panel-title">Recent deliveries</h2>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Response</th>
                      <th>Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrations.webhooks.deliveries.length ? integrations.webhooks.deliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td>{delivery.eventType}</td>
                        <td>
                          <StatusBadge status={deliveryBadge(delivery.status)}>{delivery.status}</StatusBadge>
                        </td>
                        <td>{delivery.attempts}</td>
                        <td>{delivery.responseStatus ?? delivery.lastError ?? "—"}</td>
                        <td>{formatTime(delivery.createdAt)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5}>No webhook deliveries yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
