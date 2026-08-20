"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import type { SupportMessage, SupportSessionDetail } from "@/domain/support/types";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { AgentActivityLog } from "@/components/chat/AgentActivityLog";
import { RefundOutcomeCard } from "@/components/chat/RefundOutcomeCard";
import { HostedSupportGate } from "@/components/chat/HostedSupportGate";
import { HostedSupportPanel } from "@/components/chat/HostedSupportPanel";
import { SupportPortalGate } from "@/components/chat/SupportPortalGate";
import { SupportPortalPanel } from "@/components/chat/SupportPortalPanel";
import { useRealtimeTranscription } from "@/hooks/useRealtimeTranscription";
import { attachSpeechAudio } from "@/lib/play-speech-audio";
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

type SupportEntryState = { portal: boolean; host: boolean };
type SupportSessionCreateResponse = SupportSessionDetail & { accessToken?: string };

export default function SupportPage() {
  const router = useRouter();
  const bootstrapped = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<SupportSessionDetail | null>(null);
  const [entry, setEntry] = useState<SupportEntryState | null>(null);
  const [sessionAccessToken, setSessionAccessToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SupportOutcome | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voicePhase, setVoicePhase] = useState<"idle" | "generating" | "playing">("idle");
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
    setVoicePhase("idle");
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const playAgentMessage = useCallback(async (message: SupportMessage) => {
    if (message.role !== "AGENT") return;
    stopPlayback();
    setVoicePlaybackError(null);
    setSpeakingMessageId(message.id);
    setVoicePhase("generating");

    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionAccessToken ? { Authorization: `Bearer ${sessionAccessToken}` } : {}),
        },
        body: JSON.stringify({ sessionId: message.sessionId, messageId: message.id }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "Voice playback is temporarily unavailable."));
      }

      const audio = new Audio();
      audioRef.current = audio;
      audio.onended = () => stopPlayback();
      audio.onerror = () => {
        if (!audioRef.current || audio.ended || audio.currentTime > 0) {
          stopPlayback();
          return;
        }
        setVoicePlaybackError("The AI-generated voice could not be played. The text response remains available.");
        stopPlayback();
      };
      audio.onplaying = () => setVoicePhase("playing");
      const url = await attachSpeechAudio(response, audio);
      audioUrlRef.current = url;
    } catch (caught) {
      stopPlayback();
      const messageText = caught instanceof Error ? caught.message : "Voice playback is temporarily unavailable.";
      if (messageText.toLowerCase().includes("play()") || messageText.toLowerCase().includes("autoplay")) {
        setVoicePlaybackError("Your browser blocked automatic audio playback. Use Listen on the agent message to play the AI-generated voice.");
      } else {
        setVoicePlaybackError(messageText);
      }
    }
  }, [sessionAccessToken, stopPlayback]);

  const initializeSession = useCallback(async (
    input: { email: string; orderId: string } | { launchToken: string },
  ) => {
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
      const created = (await response.json()) as SupportSessionCreateResponse;
      const { accessToken, ...sessionDetail } = created;
      if (typeof accessToken !== "string" || !accessToken) {
        throw new Error("Support session authorization is required.");
      }
      setSessionAccessToken(accessToken);
      setDetail(sessionDetail);
      setMessages(sessionDetail.messages);
      return sessionDetail;
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

    void (async () => {
      try {
        const modeResponse = await fetch("/api/support/access-mode", { cache: "no-store" });
        if (!modeResponse.ok) throw new Error("Unable to determine the support entry mode.");
        const modePayload = (await modeResponse.json()) as { portal?: unknown; host?: unknown };
        const nextEntry = {
          portal: modePayload.portal !== false,
          host: modePayload.host !== false,
        };
        setEntry(nextEntry);

        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const launchToken = fragment.get("launch")?.trim() ?? "";
        if (window.location.hash) window.history.replaceState(null, "", "/support");
        if (launchToken) await initializeSession({ launchToken });
      } catch (caught) {
        setEntry({ portal: false, host: true });
        setError(caught instanceof Error ? caught.message : "Unable to initialize support.");
      }
    })();
  }, [initializeSession]);

  const refreshSession = async (sessionId: string) => {
    const response = await fetch(`/api/support/sessions/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
      headers: sessionAccessToken ? { Authorization: `Bearer ${sessionAccessToken}` } : undefined,
    });
    if (!response.ok) return;
    const refreshed = (await response.json()) as SupportSessionDetail;
    setDetail(refreshed);
    setMessages(refreshed.messages);
  };

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

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionAccessToken ? { Authorization: `Bearer ${sessionAccessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: detail.session.id,
          message: content,
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
          setMessages((previous) => [...previous, assistantMessage]);
          if (options?.speakResponse) {
            void playAgentMessage(assistantMessage);
          }
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

  const voice = useRealtimeTranscription({
    sessionId: detail?.session.id ?? null,
    accessToken: sessionAccessToken,
    disabled: isSending || !detail,
    onFinalTranscript: async (transcript) => {
      await handleSend(transcript, { speakResponse: true });
    },
  });

  const handleNewSession = () => {
    voice.stop();
    stopPlayback();
    setDetail(null);
    setSessionAccessToken(null);
    setMessages([]);
    setActivity(null);
    setOutcome(null);
    setCurrentRunId(null);
    setError(null);
    setVoicePlaybackError(null);
    router.replace("/support", { scroll: false });
  };

  const sessionSubtitle = detail
    ? `${detail.customer.name} · Order ${detail.order.id}`
    : isStarting
      ? "Opening a secure support session…"
      : entry?.portal
        ? "Look up an order to begin."
        : entry === null
          ? "Preparing support…"
          : "Open support from your order.";

  const supportStatus = voice.isActive
    ? voice.state === "CONNECTING" ? "Voice connecting" : "Listening"
    : isSending
      ? "Working"
      : isStarting
        ? "Starting"
        : entry === null
          ? "Loading"
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
                  voicePhase={speakingMessageId === message.id ? voicePhase : "idle"}
                />
              ))}
              {activity ? <AgentActivityLog activity={activity} /> : null}
              {outcome ? <RefundOutcomeCard outcome={outcome} /> : null}
              {error ? (
                <div className={styles.errorNotice} role="alert">
                  <strong>Request could not be completed</strong>
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          ) : entry?.portal ? (
            <SupportPortalGate
              onStart={(input) => initializeSession(input).then(() => undefined)}
              isStarting={isStarting}
              sessionError={error}
            />
          ) : entry === null ? (
            <div className={styles.accessLoading} role="status">Preparing support…</div>
          ) : (
            <HostedSupportGate error={error} />
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
                Voice responses are AI-generated. Microphone turns are transcribed, then sent through the same refund agent and policy as typed messages.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <aside className={styles.contextArea}>
        {detail ? (
          <ContextPanel customer={detail.customer} order={detail.order} />
        ) : entry?.portal ? (
          <SupportPortalPanel />
        ) : (
          <HostedSupportPanel />
        )}
      </aside>
    </div>
  );
}
