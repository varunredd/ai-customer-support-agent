"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentTimeline } from "@/components/admin/AgentTimeline";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PersistedAgentEvent, PersistedAgentRun } from "@/domain/agent/types";
import { toAgentEventView } from "@/lib/agent-event-view";
import { formatMoney, formatTime } from "@/lib/format";
import styles from "./page.module.css";

interface RunSummary {
  id: string;
  status: PersistedAgentRun["status"];
  model: string;
  customerId: string | null;
  customerName: string | null;
  orderId: string | null;
  startedAt: string;
  completedAt: string | null;
  eventCount: number;
  decision: "APPROVE" | "DENY" | null;
  refundAmountCents: number | null;
}

function badgeStatus(status: PersistedAgentRun["status"]) {
  if (status === "COMPLETED") return "SUCCESS" as const;
  if (status === "FAILED") return "FAILED" as const;
  return "RUNNING" as const;
}

export default function AgentRunsPage() {
  return (
    <Suspense fallback={<div className="admin-page-fill"><LoadingState message="Loading persisted agent runs…" /></div>}>
      <AgentRunsPageInner />
    </Suspense>
  );
}

function AgentRunsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRun = searchParams.get("run");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(requestedRun);
  const [selectedRun, setSelectedRun] = useState<PersistedAgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [streamReconnecting, setStreamReconnecting] = useState(false);

  const loadRuns = useCallback(async () => {
    const response = await fetch("/api/admin/runs?limit=50", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load persisted agent runs.");
    const payload = (await response.json()) as { runs: RunSummary[] };
    setRuns(payload.runs);
    setSelectedRunId((current) => {
      const preferred = current ?? requestedRun;
      if (preferred && payload.runs.some((run) => run.id === preferred)) return preferred;
      return payload.runs[0]?.id ?? null;
    });
  }, [requestedRun]);

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`/api/admin/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load this agent run.");
    const payload = (await response.json()) as { run: PersistedAgentRun };
    setSelectedRun(payload.run);
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    await loadRuns();
    if (selectedRunId) await loadRun(selectedRunId);
  }, [loadRun, loadRuns, selectedRunId]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadRuns();
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load agent runs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRuns]);


  useEffect(() => {
    if (!selectedRunId) return;
    if (searchParams.get("run") === selectedRunId) return;
    router.replace(`/admin/runs?run=${encodeURIComponent(selectedRunId)}`, { scroll: false });
  }, [router, searchParams, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }
    void (async () => {
      try {
        setDetailLoading(true);
        await loadRun(selectedRunId);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load the selected run.");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [loadRun, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId || selectedRun?.id !== selectedRunId || selectedRun.status !== "IN_PROGRESS") return;
    const lastSequence = selectedRun.events?.at(-1)?.sequence ?? 0;
    const source = new EventSource(`/api/admin/runs/${encodeURIComponent(selectedRunId)}/events?after=${lastSequence}`);
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    setStreamReconnecting(false);

    source.addEventListener("agent_event", (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent<string>).data) as PersistedAgentEvent;
        setSelectedRun((current) => {
          if (!current || current.id !== selectedRunId) return current;
          const existing = current.events ?? [];
          if (existing.some((item) => item.id === incoming.id)) return current;
          return { ...current, events: [...existing, incoming] };
        });
      } catch {
        // Ignore malformed stream frames; persisted state is reloaded on reconnect.
      }
    });

    source.addEventListener("run_status", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: PersistedAgentRun["status"] | "MISSING";
          completedAt?: string | null;
        };
        const nextStatus = payload.status;
        if (nextStatus !== "IN_PROGRESS" && nextStatus !== "MISSING") {
          setSelectedRun((current) =>
            current
              ? { ...current, status: nextStatus, completedAt: payload.completedAt ?? current.completedAt }
              : current,
          );
          void loadRuns();
          source.close();
        }
      } catch {
        // A later persisted reload remains the source of truth.
      }
    });

    source.onerror = () => {
      source.close();
      setStreamReconnecting(true);
      reconnectTimer = setTimeout(() => {
        void loadRun(selectedRunId).finally(() => {
          setStreamGeneration((value) => value + 1);
          setStreamReconnecting(false);
        });
      }, 900);
    };

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source.close();
    };
  }, [loadRun, loadRuns, selectedRun?.id, selectedRun?.status, selectedRunId, streamGeneration]);

  const selectRun = (runId: string) => {
    setSelectedRunId(runId);
    setError(null);
    router.replace(`/admin/runs?run=${encodeURIComponent(runId)}`, { scroll: false });
  };

  const eventViews = useMemo(() => (selectedRun?.events ?? []).map(toAgentEventView), [selectedRun]);
  const selectedSummary = runs.find((run) => run.id === selectedRunId) ?? null;

  if (loading) {
    return <div className="admin-page-fill"><LoadingState message="Loading persisted agent runs…" /></div>;
  }
  if (error && runs.length === 0) {
    return (
      <div className="admin-page-fill">
        <ErrorState description={error} />
        <button className={styles.inlineRetry} type="button" onClick={() => void refreshAll()}>
          <RefreshCcw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="admin-page-fill">
      <div className={styles.page}>
        <PageHeader
          title="Agent Runs"
          description="Live structured observability for model turns, tool calls, policy checks, retries, and refund execution."
        >
          <button className={styles.refreshButton} type="button" onClick={() => void refreshAll()}>
            <RefreshCcw size={14} /> Refresh
          </button>
        </PageHeader>

        {error ? <div className={styles.errorBar} role="alert">{error}</div> : null}

        <div className={styles.split}>
          <div className={styles.masterPane}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>Recent runs</span>
              <span className={styles.count}>{runs.length}</span>
            </div>
            <div className={styles.list}>
              {runs.map((run) => (
                <button
                  key={run.id}
                  className={clsx(styles.runItem, selectedRunId === run.id && styles.runItemActive)}
                  onClick={() => selectRun(run.id)}
                >
                  <div className={styles.runHeader}>
                    <span className={styles.runId}>{run.id}</span>
                    <StatusBadge status={badgeStatus(run.status)}>{run.status}</StatusBadge>
                  </div>
                  <span className={styles.customer}>{run.customerName ?? run.customerId ?? "Unresolved customer"}</span>
                  <div className={styles.runDetails}>
                    <span>{run.orderId ?? "No order yet"}</span>
                    <span>{formatTime(run.startedAt)}</span>
                  </div>
                  {run.decision ? (
                    <div className={styles.runOutcome}>
                      <StatusBadge status={run.decision === "APPROVE" ? "SUCCESS" : "FAILED"}>{run.decision}</StatusBadge>
                      {run.decision === "APPROVE" && run.refundAmountCents != null ? <span>{formatMoney(run.refundAmountCents)}</span> : null}
                    </div>
                  ) : null}
                </button>
              ))}
              {runs.length === 0 ? <div className={styles.emptyState}>No persisted runs yet. Send a message from Support Chat.</div> : null}
            </div>
          </div>

          <div className={styles.detailPane}>
            {detailLoading && !selectedRun ? (
              <LoadingState message="Loading run timeline…" />
            ) : selectedRun ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <p className={styles.detailKicker}>Execution timeline</p>
                    <h3 className={styles.detailTitle}>{selectedRun.id}</h3>
                    <div className={styles.metaRow}>
                      <span>{selectedSummary?.customerName ?? selectedRun.customerId ?? "Customer pending"}</span>
                      <span>{selectedRun.orderId ?? "Order pending"}</span>
                      <span>{eventViews.length} events</span>
                    </div>
                    {selectedSummary?.decision ? (
                      <div className={styles.detailOutcome}>
                        <StatusBadge status={selectedSummary.decision === "APPROVE" ? "SUCCESS" : "FAILED"}>
                          {selectedSummary.decision === "APPROVE" ? "REFUND APPROVED" : "REFUND DENIED"}
                        </StatusBadge>
                        {selectedSummary.decision === "APPROVE" && selectedSummary.refundAmountCents != null
                          ? <strong>{formatMoney(selectedSummary.refundAmountCents)}</strong>
                          : null}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.statusStack}>
                    <StatusBadge status={badgeStatus(selectedRun.status)}>{selectedRun.status}</StatusBadge>
                    {selectedRun.status === "IN_PROGRESS" ? (
                      <span className={styles.liveState}>{streamReconnecting ? "Reconnecting…" : "Live"}</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.timeline}>
                  <AgentTimeline events={eventViews} />
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>Select a persisted run to inspect its timeline.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
