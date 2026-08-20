"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatTime, shortId } from "@/lib/format";
import type { SupportMessage, SupportMessageRole, SupportSessionStatus } from "@/domain/support/types";
import styles from "@/app/(admin)/admin/runs/page.module.css";
import transcript from "./ConversationsInbox.module.css";

interface ConversationSummary {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  status: SupportSessionStatus;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageRole: SupportMessageRole | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationDetail {
  session: { id: string; customerId: string; orderId: string; status: SupportSessionStatus; createdAt: string; updatedAt: string };
  messages: SupportMessage[];
  customerName: string;
  customerEmail: string;
}

export function ConversationsInbox() {
  return (
    <Suspense fallback={<div className="admin-page-fill"><LoadingState message="Loading…" /></div>}>
      <ConversationsInboxInner />
    </Suspense>
  );
}

function ConversationsInboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("session");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(requested);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const response = await fetch("/api/admin/conversations?limit=80", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load support conversations.");
    const payload = (await response.json()) as { conversations: ConversationSummary[] };
    setConversations(payload.conversations);
    setSelectedId((current) => {
      const preferred = current ?? requested;
      if (preferred && payload.conversations.some((item) => item.id === preferred)) return preferred;
      return payload.conversations[0]?.id ?? null;
    });
  }, [requested]);

  const loadDetail = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/admin/conversations/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load this conversation.");
    const payload = (await response.json()) as { conversation: ConversationDetail };
    setDetail(payload.conversation);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await loadList();
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load conversations.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    if (searchParams.get("session") === selectedId) return;
    router.replace(`/admin/conversations?session=${encodeURIComponent(selectedId)}`, { scroll: false });
  }, [router, searchParams, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void (async () => {
      try {
        setDetailLoading(true);
        await loadDetail(selectedId);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load the selected conversation.");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [loadDetail, selectedId]);

  async function refreshAll() {
    setError(null);
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  }

  if (loading) {
    return <div className="admin-page-fill"><LoadingState message="Loading…" /></div>;
  }
  if (error && conversations.length === 0) {
    return (
      <div className="admin-page-fill">
        <ErrorState description={error} />
        <button className={styles.inlineRetry} type="button" onClick={() => void refreshAll()}>
          <RefreshCcw size={14} /> Retry
        </button>
      </div>
    );
  }

  const selected = conversations.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="admin-page-fill">
      <div className={styles.page}>
        <PageHeader title="Conversations" description="Support sessions and transcripts for this merchant.">
          <button className={styles.refreshButton} type="button" onClick={() => void refreshAll()}>
            <RefreshCcw size={14} /> Refresh
          </button>
        </PageHeader>

        {error ? <div className={styles.errorBar} role="alert">{error}</div> : null}

        <div className={styles.split}>
          <div className={styles.masterPane}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>Recent sessions</span>
              <span className={styles.count}>{conversations.length}</span>
            </div>
            <div className={styles.list}>
              {conversations.map((item) => (
                <button
                  key={item.id}
                  className={clsx(styles.runItem, selectedId === item.id && styles.runItemActive)}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className={styles.runHeader}>
                    <span className={styles.customer}>{item.customerName}</span>
                    <StatusBadge status={item.status === "OPEN" ? "RUNNING" : "SUCCESS"}>{item.status}</StatusBadge>
                  </div>
                  <span className={styles.runId} title={item.orderId}>{shortId(item.orderId)}</span>
                  <div className={styles.runDetails}>
                    <span>{item.messageCount} messages</span>
                    <span>{formatTime(item.updatedAt)}</span>
                  </div>
                  {item.lastMessagePreview ? (
                    <p className={transcript.preview}>{item.lastMessagePreview}</p>
                  ) : null}
                </button>
              ))}
              {conversations.length === 0 ? <div className={styles.emptyState}>No support conversations yet.</div> : null}
            </div>
          </div>

          <div className={styles.detailPane}>
            {detailLoading && !detail ? (
              <LoadingState message="Loading transcript…" />
            ) : detail ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <p className={styles.detailKicker}>Transcript</p>
                    <h3 className={styles.detailTitle}>{detail.customerName}</h3>
                    <div className={styles.metaRow}>
                      <span>{detail.customerEmail}</span>
                      <span title={detail.session.orderId}>{shortId(detail.session.orderId)}</span>
                      <span>{detail.messages.length} messages</span>
                    </div>
                  </div>
                  <StatusBadge status={detail.session.status === "OPEN" ? "RUNNING" : "SUCCESS"}>
                    {detail.session.status}
                  </StatusBadge>
                </div>
                <div className={transcript.thread}>
                  {detail.messages.map((message) => (
                    <article
                      key={message.id}
                      className={clsx(transcript.bubble, message.role === "AGENT" ? transcript.agent : transcript.customer)}
                    >
                      <div className={transcript.bubbleMeta}>
                        <strong>{message.role === "AGENT" ? "Agent" : selected?.customerName ?? "Customer"}</strong>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  ))}
                  {detail.messages.length === 0 ? <div className={styles.emptyState}>No messages in this session.</div> : null}
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>Select a conversation.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
