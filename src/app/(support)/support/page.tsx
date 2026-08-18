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
import { useRealtimeTranscription } from "@/hooks/useRealtimeTranscription";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voicePlaybackError, setVoicePlaybackError] = useState<string | null>(null);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (audio) audio.removeAttribute("src");
    setSpeakingMessageId(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const playAgentMessage = useCallback(async (message: SupportMessage) => {
    if (message.role !== "AGENT") return;
    stopPlayback();
    setVoicePlaybackError(null);
    setSpeakingMessageId(message.id);

    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: message.sessionId, messageId: message.id }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "Voice playback is temporarily unavailable."));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = () => stopPlayback();
      audio.onerror = () => {
        // Clearing src after a successful play also fires error; ignore that cleanup.
        if (!audioRef.current || audio.ended || audio.currentTime > 0) {
          stopPlayback();
          return;
        }
        setVoicePlaybackError("The AI-generated voice could not be played. The text response remains available.");
        stopPlayback();
      };
      await audio.play();
    } catch (caught) {
      stopPlayback();
      const messageText = caught instanceof Error ? caught.message : "Voice playback is temporarily unavailable.";
      if (messageText.toLowerCase().includes("play()") || messageText.toLowerCase().includes("autoplay")) {
        setVoicePlaybackError("Your browser blocked automatic audio playback. Use Listen on the agent message to play the AI-generated voice.");
      } else {
        setVoicePlaybackError(messageText);
      }
    }
  }, [stopPlayback]);

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

  const handleSend = async (content: string, options?: { speakResponse?: boolean }) => {
    if (!detail || isSending) return;
    stopPlayback();
    setVoicePlaybackError(null);
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
    let assistantMessageForVoice: SupportMessage | null = null;

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
          const assistantMessage = data as SupportMessage;
          assistantMessageForVoice = assistantMessage;
          setMessages((previous) => [...previous, assistantMessage]);
        }
        if (event === "error" && data && typeof data === "object" && !Array.isArray(data)) {
          const message = (data as { message?: unknown }).message;
          throw new Error(typeof message === "string" ? message : "The support agent failed.");
        }
      });

      await refreshSession(detail.session.id);
      setActivity(null);
      if (options?.speakResponse && assistantMessageForVoice) {
        await playAgentMessage(assistantMessageForVoice);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The support request failed.");
      setActivity(null);
      await refreshSession(detail.session.id);
    } finally {
      setIsSending(false);
    }
  };

  const voice = useRealtimeTranscription({
    sessionId: detail?.session.id ?? null,
    disabled: isSending || !detail,
    onFinalTranscript: async (transcript) => {
      await handleSend(transcript, { speakResponse: true });
    },
  });

  const handleNewSession = () => {
    voice.stop();
    stopPlayback();
    setDetail(null);
    setScenario(null);
    setMessages([]);
    setActivity(null);
    setOutcome(null);
    setCurrentRunId(null);
    setError(null);
    setVoicePlaybackError(null);
    setSetupCustomer(null);
    setSetupOrder(null);
    router.replace("/support", { scroll: false });
  };

  const sessionSubtitle = detail
    ? `${scenario ? `${DEMO_SCENARIOS[scenario].label} demo · ` : ""}${detail.customer.name} · Order ${detail.order.id}`
    : scenario && isStarting
      ? `Preparing ${DEMO_SCENARIOS[scenario].label.toLowerCase()} demo…`
      : "Choose a CRM customer and owned order to begin.";

  const supportStatus = voice.isActive
    ? voice.state === "CONNECTING" ? "Voice connecting" : "Listening"
    : isSending
      ? "Working"
      : isStarting
        ? "Starting"
        : "Ready";

  return (
    <div className={styles.layout}>
      <div className={styles.chatArea}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Customer Support</h1>
              <div className={styles.status}>
                <span className={styles.statusDot} />
                <span className={styles.statusText}>{supportStatus}</span>
              </div>
            </div>
            <p className={styles.session}>{sessionSubtitle}</p>
          </div>
          <div className={styles.headerActions}>
            {detail ? (
              <button type="button" className={styles.newSessionButton} onClick={handleNewSession} disabled={isSending || voice.isActive}>
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
                  onSpeak={message.role === "AGENT" && !message.id.startsWith("local_") ? () => void playAgentMessage(message) : undefined}
                  speaking={speakingMessageId === message.id}
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
                voiceState={voice.state}
                voicePreview={voice.partialTranscript}
                voiceError={voice.error}
                onVoiceToggle={voice.toggle}
              />
              {voicePlaybackError ? <p className={styles.voicePlaybackError} role="status">{voicePlaybackError}</p> : null}
              <p className={styles.hint}>
                Voice responses are AI-generated. Microphone turns are transcribed with OpenAI Realtime, then sent through the same server-side refund agent and deterministic policy as typed messages.
              </p>
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
