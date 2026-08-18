"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentTimeline } from "@/components/admin/AgentTimeline";
import { agentRunsPreview, AgentRunPreview } from "@/data/ui/agentRunPreview";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { customers } from "@/data/customers";
import { formatTime } from "@/lib/format";
import styles from "./page.module.css";
import clsx from "clsx";

function badgeStatus(status: AgentRunPreview["status"]) {
  if (status === "COMPLETED") return "SUCCESS" as const;
  if (status === "FAILED") return "FAILED" as const;
  return "RUNNING" as const;
}

export default function AgentRunsPage() {
  const [selectedRun, setSelectedRun] = useState<AgentRunPreview | null>(agentRunsPreview[0] || null);
  const selectedCustomer = customers.find((customer) => customer.id === selectedRun?.customerId);

  const runSummaries = useMemo(
    () =>
      agentRunsPreview.map((run) => ({
        ...run,
        customerName: customers.find((customer) => customer.id === run.customerId)?.name ?? run.customerId,
      })),
    [],
  );

  return (
    <div className="admin-page-fill">
      <div className={styles.page}>
        <PageHeader
          title="Agent Runs"
          description="Inspect every tool call, policy check, retry, and final refund decision."
        />

        <div className={styles.split}>
          <div className={styles.masterPane}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>Recent runs</span>
              <span className={styles.count}>{runSummaries.length}</span>
            </div>
            <div className={styles.list}>
              {runSummaries.map((run) => (
                <button
                  key={run.id}
                  className={clsx(styles.runItem, selectedRun?.id === run.id && styles.runItemActive)}
                  onClick={() => setSelectedRun(run)}
                >
                  <div className={styles.runHeader}>
                    <span className={styles.runId}>{run.id}</span>
                    <StatusBadge status={badgeStatus(run.status)}>{run.status}</StatusBadge>
                  </div>
                  <span className={styles.customer}>{run.customerName}</span>
                  <div className={styles.runDetails}>
                    <span>{run.orderId}</span>
                    <span>{formatTime(run.startedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.detailPane}>
            {selectedRun ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <p className={styles.detailKicker}>Execution timeline</p>
                    <h3 className={styles.detailTitle}>{selectedRun.id}</h3>
                    <div className={styles.metaRow}>
                      <span>{selectedCustomer?.name ?? selectedRun.customerId}</span>
                      <span>{selectedRun.orderId}</span>
                      <span>{selectedRun.events.length} events</span>
                    </div>
                  </div>
                  <StatusBadge status={badgeStatus(selectedRun.status)}>{selectedRun.status}</StatusBadge>
                </div>
                <div className={styles.timeline}>
                  <AgentTimeline events={selectedRun.events} />
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>Select a run to inspect its timeline</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
