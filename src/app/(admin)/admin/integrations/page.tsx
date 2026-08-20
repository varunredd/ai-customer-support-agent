"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatTime } from "@/lib/format";
import type { AdminIntegrationStatus } from "@/repositories/admin-read.repository";

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<AdminIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/integrations", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load integration status.");
        const payload = (await response.json()) as { integrations: AdminIntegrationStatus };
        setIntegrations(payload.integrations);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load integrations.");
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader
          title="Integrations"
          description="Connection health for this merchant. Credentials stay in environment config until the encrypted vault ships."
        />
        {!integrations && !error ? <LoadingState message="Loading…" /> : null}
        {error ? <ErrorState description={error} /> : null}
        {integrations ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Commerce</h2>
                <StatusBadge status={integrations.commerce.configured ? "SUCCESS" : "WARNING"}>
                  {integrations.commerce.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                </StatusBadge>
              </div>
              <div className="panel-body">
                <p><strong>Host</strong> · {integrations.commerce.host ?? "Not set"}</p>
                <p className="panel-subtitle" style={{ marginTop: 8 }}>
                  Last event {integrations.commerce.lastEventAt ? `${formatTime(integrations.commerce.lastEventAt)} · ${integrations.commerce.lastEventStatus}` : "none yet"}
                  {integrations.commerce.lastEventSource ? ` · ${integrations.commerce.lastEventSource}` : ""}
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Email</h2>
                <StatusBadge status={integrations.email.configured ? "SUCCESS" : "WARNING"}>
                  {integrations.email.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                </StatusBadge>
              </div>
              <div className="panel-body">
                <p>Delivery mode · {integrations.email.deliveryMode}</p>
                <p className="panel-subtitle" style={{ marginTop: 8 }}>API keys are never shown in this console.</p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Webhooks</h2>
                <StatusBadge status="NEUTRAL">NEXT STEP</StatusBadge>
              </div>
              <div className="panel-body">
                <p>{integrations.webhooks.note}</p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
