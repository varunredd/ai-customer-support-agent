"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bot, MessageSquare, Receipt, ShieldAlert, UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatMoney } from "@/lib/format";
import type { AdminAnalyticsSnapshot } from "@/repositories/admin-read.repository";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/analytics", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load analytics.");
        const payload = (await response.json()) as { analytics: AdminAnalyticsSnapshot };
        setAnalytics(payload.analytics);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load analytics.");
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-stack">
        <PageHeader title="Analytics" description="Automation, refunds, and agent volume for this merchant." />
        {!analytics && !error ? <LoadingState message="Loading…" /> : null}
        {error ? <ErrorState description={error} /> : null}
        {analytics ? (
          <>
            <div className="kpi-grid">
              <StatCard
                label="Automation rate"
                value={`${Math.round(analytics.automationRate * 100)}%`}
                hint="Refunds issued without manager approval"
                icon={<Bot size={16} />}
                tone="success"
              />
              <StatCard
                label="Refunded"
                value={formatMoney(analytics.refundedCents)}
                hint={`${analytics.refundCount} ledger rows`}
                icon={<Receipt size={16} />}
              />
              <StatCard
                label="Policy denials"
                value={String(analytics.policyDenials)}
                hint={`${analytics.policyApprovals} policy approvals`}
                icon={<ShieldAlert size={16} />}
              />
              <StatCard
                label="Open escalations"
                value={String(analytics.openEscalations)}
                hint={`${analytics.pendingApprovals} waiting on approval`}
                icon={<UserRoundCheck size={16} />}
                tone={analytics.openEscalations || analytics.pendingApprovals ? "warning" : "success"}
              />
            </div>
            <div className="kpi-grid">
              <StatCard label="Agent runs" value={String(analytics.runsTotal)} hint={`${analytics.runsCompleted} completed · ${analytics.runsFailed} failed`} icon={<Activity size={16} />} />
              <StatCard label="Conversations" value={String(analytics.conversations)} hint="Support sessions" icon={<MessageSquare size={16} />} />
              <StatCard label="Failed runs" value={String(analytics.runsFailed)} hint="Inspect in Agent Runs" icon={<Activity size={16} />} tone={analytics.runsFailed ? "warning" : undefined} />
              <StatCard label="Manager approved" value={String(analytics.managerApproved)} hint="HITL refunds" icon={<Receipt size={16} />} />
            </div>
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Where to look next</h2>
              </div>
              <div className="panel-body">
                <p className="panel-subtitle">CSAT is not collected yet. Failed runs and refund outcomes are available now.</p>
                <p style={{ marginTop: 12 }}>
                  <Link className="table-link" href="/admin/runs">Agent runs</Link>
                  {" · "}
                  <Link className="table-link" href="/admin/decisions">Decisions</Link>
                  {" · "}
                  <Link className="table-link" href="/admin/refunds">Refunds</Link>
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
