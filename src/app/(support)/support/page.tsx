"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import type { SupportMessage, SupportSessionDetail } from "@/domain/support/types";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { AgentActivityLog } from "@/components/chat/AgentActivityLog";
import { readSseResponse } from "@/lib/sse-client";
import styles from "./page.module.css";

const SCENARIOS = {
  approve: { customerId: "cus_001", orderId: "ord_demo_approve", demoFailure: false },
  deny: { customerId: "cus_002", orderId: "ord_demo_final_sale", demoFailure: false },
  retry: { customerId: "cus_001", orderId: "ord_demo_approve", demoFailure: true },
} as const;

type ScenarioName = keyof typeof SCENARIOS;

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function activityLabel(event: PersistedAgentEvent) {
  if (event.type === "TOOL_STARTED") return `Using ${event.toolName ?? "support tool"}…`;
  if (event.type === "TOOL_RETRY") return `Retrying ${event.toolName ?? "support tool"}…`;
  if (event.type === "POLICY_CHECK") return "Validating refund policy…";
  if (event.type === "DECISION") return event.status === "SUCCESS" ? "Refund eligibility confirmed." : "Policy check found a restriction.";
  if (event.type === "REFUND_EXECUTION") return event.status === "SUCCESS" ? "Refund recorded successfully." : "Refund execution was blocked.";
  return null;
}

export default function SupportPage() {
  const bootstrapped = useRef(false);
  const [detail, setDetail] = useState<SupportSessionDetail | null>(null);
  const [scenario, setScenario] = useState<ScenarioName>("approve");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      try {
        const requestedScenario = new URLSearchParams(window.location.search).get("scenario");
        const resolvedScenario: ScenarioName = requestedScenario === "deny" || requestedScenario === "retry" ? requestedScenario : "approve";
        const config = SCENARIOS[resolvedScenario];
        setScenario(resolvedScenario);
        const response = await fetch("/api/support/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: config.customerId, orderId: config.orderId }),
        });
        if (!response.ok) throw new Error("Unable to create the demo support session. Run npm run db:reset and try again.");
        const created = (await response.json()) as SupportSessionDetail;
        setDetail(created);
        setMessages(created.messages);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to initialize support chat.");
      }
    })();
  }, []);

  const refreshSession = async (sessionId: string) => {
    const response = await fetch(`/api/support/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const refreshed = (await response.json()) as SupportSessionDetail;
    setDetail(refreshed);
    setMessages(refreshed.messages);
  };

  const handleSend = async (content: string) => {
    if (!detail || isSending) return;
    const optimistic: SupportMessage = {
      id: `local_${Date.now()}`,
      sessionId: detail.session.id,
      runId: null,
      role: "CUSTOMER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, optimistic]);
    setIsSending(true);
    setError(null);
    setActivity("Sending request to the support agent…");

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: detail.session.id, message: content, ...(SCENARIOS[scenario].demoFailure ? { demoFailure: "LOOKUP_ORDER_ONCE" } : {}) }),
      });

      await readSseResponse(response, async ({ event, data }) => {
        if (event === "run" && data && typeof data === "object" && !Array.isArray(data)) {
          const record = data as Record<string, unknown>;
          const runId = record.runId;
          if (typeof runId === "string") setCurrentRunId(runId);
          if (record.customerMessage && typeof record.customerMessage === "object" && !Array.isArray(record.customerMessage)) {
            const persistedCustomerMessage = record.customerMessage as SupportMessage;
            setMessages((previous) => [...previous.filter((message) => !message.id.startsWith("local_")), persistedCustomerMessage]);
          }
        }
        if (event === "agent_event" && data && typeof data === "object" && !Array.isArray(data)) {
          const label = activityLabel(data as PersistedAgentEvent);
          if (label) setActivity(label);
        }
        if (event === "assistant_message" && data && typeof data === "object" && !Array.isArray(data)) {
          setMessages((previous) => [...previous, data as SupportMessage]);
        }
        if (event === "error" && data && typeof data === "object" && !Array.isArray(data)) {
          const message = (data as { message?: unknown }).message;
          throw new Error(typeof message === "string" ? message : "The support agent failed.");
        }
      });

      await refreshSession(detail.session.id);
      setActivity(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The support request failed.");
      setActivity(null);
      await refreshSession(detail.session.id);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.chatArea}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Customer Support</h1>
              <div className={styles.status}>
                <span className={styles.statusDot} />
                <span className={styles.statusText}>{isSending ? "Working" : "Online"}</span>
              </div>
            </div>
            <p className={styles.session}>
              {detail ? `Live session · ${detail.customer.name} · Order ${detail.order.id}` : "Starting secure demo session…"}
            </p>
          </div>
          <Link href={currentRunId ? `/admin/runs?run=${encodeURIComponent(currentRunId)}` : "/admin"} className={styles.adminLink}>
            <LayoutDashboard size={15} />
            {currentRunId ? "View run" : "Admin"}
          </Link>
        </header>

        <main className={styles.chatHistory}>
          <div className={styles.chatFeed}>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role === "AGENT" ? "agent" : "customer"}
                content={message.content}
                timestamp={formatMessageTime(message.createdAt)}
              />
            ))}
            {activity ? <AgentActivityLog activity={activity} /> : null}
            {error ? <div className={styles.errorNotice}>{error}</div> : null}
          </div>
        </main>

        <div className={styles.composerArea}>
          <div className={styles.composerInner}>
            <ChatComposer
              onSend={handleSend}
              disabled={!detail || isSending}
              placeholder={detail ? "Ask about your refund…" : "Preparing support session…"}
            />
            <p className={styles.hint}>The model chooses tools; deterministic server-side policy decides refund eligibility and amount.</p>
          </div>
        </div>
      </div>

      <aside className={styles.contextArea}>
        {detail ? <ContextPanel customer={detail.customer} order={detail.order} /> : null}
      </aside>
    </div>
  );
}
