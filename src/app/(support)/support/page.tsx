"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, RotateCcw } from "lucide-react";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import type { SupportMessage, SupportSessionDetail } from "@/domain/support/types";
import { DEMO_SCENARIOS, parseDemoScenario, type DemoScenarioName } from "@/config/demo-scenarios";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { AgentActivityLog } from "@/components/chat/AgentActivityLog";
import { RefundOutcomeCard } from "@/components/chat/RefundOutcomeCard";
import { SupportSessionSetup } from "@/components/chat/SupportSessionSetup";
import { SupportSetupPanel } from "@/components/chat/SupportSetupPanel";
import type { SupportCustomerOption, SupportOrderOption } from "@/domain/support/context";
import { readSseResponse } from "@/lib/sse-client";
import { supportOutcomeFromEvent, type SupportOutcome } from "@/lib/support-outcome";
import styles from "./page.module.css";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function activityLabel(event: PersistedAgentEvent) {
  if (event.type === "MODEL_RETRY") return "Retrying the AI model…";
  if (event.type === "TOOL_STARTED") return `Using ${event.toolName ?? "support tool"}…`;
  if (event.type === "TOOL_RETRY") return `Retrying ${event.toolName ?? "support tool"}…`;
  if (event.type === "POLICY_CHECK") return "Validating refund policy…";
  if (event.type === "DECISION") return event.status === "SUCCESS" ? "Refund eligibility confirmed." : "Policy check found a restriction.";
  if (event.type === "REFUND_EXECUTION") return event.status === "SUCCESS" ? "Refund recorded successfully." : "Refund execution was blocked.";
  return null;
}

async function readResponseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

export default function SupportPage() {
  const router = useRouter();
  const bootstrapped = useRef(false);
  const [detail, setDetail] = useState<SupportSessionDetail | null>(null);
  const [scenario, setScenario] = useState<DemoScenarioName | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SupportOutcome | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupCustomer, setSetupCustomer] = useState<SupportCustomerOption | null>(null);
  const [setupOrder, setSetupOrder] = useState<SupportOrderOption | null>(null);

  const initializeSession = useCallback(async (input: { customerId: string; orderId: string }) => {
    setIsStarting(true);
    setError(null);
    setOutcome(null);
    setCurrentRunId(null);
    try {
      const response = await fetch("/api/support/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "Unable to create the support session."));
      }
      const created = (await response.json()) as SupportSessionDetail;
      setDetail(created);
      setMessages(created.messages);
      return created;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to initialize support chat.");
      return null;
    } finally {
      setIsStarting(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const requestedScenario = parseDemoScenario(new URLSearchParams(window.location.search).get("scenario"));
    if (!requestedScenario) return;

    const config = DEMO_SCENARIOS[requestedScenario];
    setScenario(requestedScenario);
    void initializeSession({ customerId: config.customerId, orderId: config.orderId });
  }, [initializeSession]);

  const refreshSession = async (sessionId: string) => {
    const response = await fetch(`/api/support/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const refreshed = (await response.json()) as SupportSessionDetail;
    setDetail(refreshed);
    setMessages(refreshed.messages);
  };

  const handleManualStart = async (input: { customerId: string; orderId: string }) => {
    setScenario(null);
    await initializeSession(input);
  };

  const handleSelectionChange = useCallback((selection: {
    customer: SupportCustomerOption | null;
    order: SupportOrderOption | null;
  }) => {
    setSetupCustomer(selection.customer);
    setSetupOrder(selection.order);
  }, []);

  const handleNewSession = () => {
    setDetail(null);
    setScenario(null);
    setMessages([]);
    setActivity(null);
    setOutcome(null);
    setCurrentRunId(null);
    setError(null);
    setSetupCustomer(null);
    setSetupOrder(null);
    router.replace("/support", { scroll: false });
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
    setOutcome(null);
    setActivity("Sending request to the support agent…");

    try {
      const demoFailure = scenario ? DEMO_SCENARIOS[scenario].demoFailure : false;
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: detail.session.id,
          message: content,
          ...(demoFailure ? { demoFailure: "LOOKUP_ORDER_ONCE" } : {}),
        }),
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
          const agentEvent = data as PersistedAgentEvent;
          const label = activityLabel(agentEvent);
          if (label) setActivity(label);
          const nextOutcome = supportOutcomeFromEvent(agentEvent);
          if (nextOutcome) setOutcome(nextOutcome);
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

  const sessionSubtitle = detail
    ? `${scenario ? `${DEMO_SCENARIOS[scenario].label} demo · ` : ""}${detail.customer.name} · Order ${detail.order.id}`
    : scenario && isStarting
      ? `Preparing ${DEMO_SCENARIOS[scenario].label.toLowerCase()} demo…`
      : "Choose a CRM customer and owned order to begin.";

  return (
    <div className={styles.layout}>
      <div className={styles.chatArea}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Customer Support</h1>
              <div className={styles.status}>
                <span className={styles.statusDot} />
                <span className={styles.statusText}>{isSending ? "Working" : isStarting ? "Starting" : "Ready"}</span>
              </div>
            </div>
            <p className={styles.session}>{sessionSubtitle}</p>
          </div>
          <div className={styles.headerActions}>
            {detail ? (
              <button type="button" className={styles.newSessionButton} onClick={handleNewSession} disabled={isSending}>
                <RotateCcw size={14} /> New session
              </button>
            ) : null}
            <Link href={currentRunId ? `/admin/runs?run=${encodeURIComponent(currentRunId)}` : "/admin"} className={styles.adminLink}>
              <LayoutDashboard size={15} />
              {currentRunId ? "View run" : "Admin"}
            </Link>
          </div>
        </header>

        <main className={`${styles.chatHistory} ${!detail ? styles.setupHistory : ""}`}>
          {detail ? (
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
              {outcome ? <RefundOutcomeCard outcome={outcome} /> : null}
              {error ? (
                <div className={styles.errorNotice} role="alert">
                  <strong>Request could not be completed</strong>
                  <span>{error}</span>
                  {currentRunId ? (
                    <Link href={`/admin/runs?run=${encodeURIComponent(currentRunId)}`}>Check the run before trying again</Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <SupportSessionSetup
              onStart={handleManualStart}
              onSelectionChange={handleSelectionChange}
              isStarting={isStarting}
              sessionError={error}
            />
          )}
        </main>

        {detail ? (
          <div className={styles.composerArea}>
            <div className={styles.composerInner}>
              <ChatComposer
                onSend={handleSend}
                disabled={isSending}
                placeholder={isSending ? "Agent is working…" : "Ask about your refund…"}
              />
              <p className={styles.hint}>AI-assisted support · refund decisions are enforced by server-side policy.</p>
            </div>
          </div>
        ) : null}
      </div>

      <aside className={styles.contextArea}>
        {detail ? (
          <ContextPanel customer={detail.customer} order={detail.order} />
        ) : (
          <SupportSetupPanel customer={setupCustomer} order={setupOrder} />
        )}
      </aside>
    </div>
  );
}
