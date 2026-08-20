"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { PersistedAgentEvent } from "@/domain/agent/types";
import type { SupportMessage, SupportSessionDetail } from "@/domain/support/types";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { AgentActivityLog } from "@/components/chat/AgentActivityLog";
import { EscalationCard } from "@/components/chat/EscalationCard";
import { RefundOutcomeCard } from "@/components/chat/RefundOutcomeCard";
import { HostedSupportGate } from "@/components/chat/HostedSupportGate";
import { HostedSupportPanel } from "@/components/chat/HostedSupportPanel";
import { SupportPortalGate } from "@/components/chat/SupportPortalGate";
import { SupportPortalPanel } from "@/components/chat/SupportPortalPanel";
import { useRealtimeTranscription } from "@/hooks/useRealtimeTranscription";
import { attachSpeechAudio } from "@/lib/play-speech-audio";
import { readSseResponse } from "@/lib/sse-client";
import { supportOutcomeFromEvent, supportOutcomeFromWorkspace, type SupportOutcome } from "@/lib/support-outcome";
import { customerPolicyChecksFromUnknown } from "@/lib/customer-policy-checks";
import { clearStoredSupportSession, readStoredSupportSession, writeStoredSupportSession } from "@/lib/support-session-storage";
import type { TenantBranding } from "@/domain/tenant/branding";
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
  if (event.type === "ESCALATION") return "Connecting you with a support specialist…";
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
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());
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
  const [branding, setBranding] = useState<TenantBranding | null>(null);

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

  const playAgentMessage = useCallback(async (
    message: SupportMessage,
    options?: { accessToken?: string; manual?: boolean },
  ) => {
    if (message.role !== "AGENT" || message.id.startsWith("local_")) return;

    const autoPlayEnabled = process.env.NEXT_PUBLIC_VOICE_AUTO_PLAY !== "false";
    if (!options?.manual && !autoPlayEnabled) return;
    if (!options?.manual && spokenMessageIdsRef.current.has(message.id)) return;

    stopPlayback();
    setVoicePlaybackError(null);
    setSpeakingMessageId(message.id);
    setVoicePhase("generating");
    spokenMessageIdsRef.current.add(message.id);

    const token = options?.accessToken ?? sessionAccessToken;

    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      spokenMessageIdsRef.current.delete(message.id);
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
      writeStoredSupportSession({ sessionId: sessionDetail.session.id, accessToken });
      setDetail(sessionDetail);
      setBranding(sessionDetail.branding);
      setMessages(sessionDetail.messages);
      spokenMessageIdsRef.current.clear();
      const welcome = sessionDetail.messages.find((message) => message.role === "AGENT");
      if (welcome) void playAgentMessage(welcome, { accessToken });
      return sessionDetail;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to initialize support chat.");
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [playAgentMessage]);

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

        try {
          const brandingResponse = await fetch("/api/support/branding", { cache: "no-store" });
          if (brandingResponse.ok) {
            const brandingPayload = (await brandingResponse.json()) as TenantBranding;
            if (typeof brandingPayload.name === "string" && brandingPayload.name.trim()) {
              setBranding(brandingPayload);
            }
          }
        } catch {
          // Branding is optional; the workspace still works with tenant defaults.
        }

        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const launchToken = fragment.get("launch")?.trim() ?? "";
        if (window.location.hash) window.history.replaceState(null, "", "/support");
        if (launchToken) {
          await initializeSession({ launchToken });
          return;
        }

        const stored = readStoredSupportSession();
        if (!stored) return;
        const resumeResponse = await fetch(`/api/support/sessions/${encodeURIComponent(stored.sessionId)}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${stored.accessToken}` },
        });
        if (!resumeResponse.ok) {
          clearStoredSupportSession();
          return;
        }
        const resumed = (await resumeResponse.json()) as SupportSessionDetail;
        setSessionAccessToken(stored.accessToken);
        setDetail(resumed);
        setBranding(resumed.branding);
        setMessages(resumed.messages);
        setOutcome(supportOutcomeFromWorkspace(resumed.workspace));
      } catch (caught) {
        setEntry({ portal: false, host: true });
        setError(caught instanceof Error ? caught.message : "Unable to initialize support.");
      }
    })();
  }, [initializeSession]);

  const refreshSession = useCallback(async (sessionId: string, accessToken = sessionAccessToken) => {
    const response = await fetch(`/api/support/sessions/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (!response.ok) return null;
    const refreshed = (await response.json()) as SupportSessionDetail;
    setDetail(refreshed);
    setBranding(refreshed.branding);
    setMessages(refreshed.messages);
    setOutcome((current) => current ?? supportOutcomeFromWorkspace(refreshed.workspace));
    return refreshed;
  }, [sessionAccessToken]);

  const sessionId = detail?.session.id ?? null;
  const lastMessage = messages[messages.length - 1];
  const awaitingAgentReply = Boolean(sessionId && lastMessage?.role === "CUSTOMER" && !isSending);

  useEffect(() => {
    if (!sessionId || !sessionAccessToken || !awaitingAgentReply) return;
    let cancelled = false;
    setActivity((current) => current ?? "Waiting for the support agent…");
    const startedAt = Date.now();

    void (async () => {
      while (!cancelled && Date.now() - startedAt < 90_000) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled) return;
        const refreshed = await refreshSession(sessionId, sessionAccessToken);
        const latest = refreshed?.messages[refreshed.messages.length - 1];
        if (latest?.role === "AGENT") {
          if (!cancelled) setActivity(null);
          return;
        }
      }
      if (!cancelled) setActivity(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [awaitingAgentReply, refreshSession, sessionAccessToken, sessionId]);

  const handleSend = async (content: string) => {
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
          if (agentEvent.type === "POLICY_CHECK" && agentEvent.metadata) {
            const policyVersion = typeof agentEvent.metadata.policyVersion === "string"
              ? agentEvent.metadata.policyVersion
              : null;
            setDetail((previous) => {
              if (!previous) return previous;
              return {
                ...previous,
                workspace: {
                  ...previous.workspace,
                  policyChecks: customerPolicyChecksFromUnknown(agentEvent.metadata?.checks),
                  policyVersion: policyVersion ?? previous.workspace.policyVersion,
                },
              };
            });
          }
        }
        if (event === "assistant_message" && data && typeof data === "object" && !Array.isArray(data)) {
          const assistantMessage = data as SupportMessage;
          setMessages((previous) => [...previous, assistantMessage]);
          void playAgentMessage(assistantMessage);
        }
        if (event === "error" && data && typeof data === "object" && !Array.isArray(data)) {
          const message = (data as { message?: unknown }).message;
          throw new Error(typeof message === "string" ? message : "The support agent failed.");
        }
      });

      await refreshSession(detail.session.id);
      setActivity(null);
    } catch (caught) {
      const aborted = caught instanceof Error && /abort|fetch/i.test(caught.message) && /abort/i.test(caught.message);
      if (!aborted) {
        setError(caught instanceof Error ? caught.message : "The support request failed.");
      }
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
      await handleSend(transcript);
    },
  });

  const handleNewSession = () => {
    voice.stop();
    stopPlayback();
    spokenMessageIdsRef.current.clear();
    clearStoredSupportSession();
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

  const merchantName = detail?.branding.name ?? branding?.name;
  const merchantAccent = detail?.branding.accent ?? branding?.accent ?? null;
  const merchantLogo = detail?.branding.logoUrl ?? branding?.logoUrl ?? null;
  const layoutStyle = merchantAccent
    ? {
        "--accent": merchantAccent,
        "--accent-hover": merchantAccent,
        "--accent-text": merchantAccent,
      } as CSSProperties
    : undefined;

  return (
    <div className={styles.layout} style={layoutStyle}>
      <div className={styles.chatArea}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              {merchantLogo ? (
                <img src={merchantLogo} alt="" className={styles.brandLogo} />
              ) : null}
              <h1 className={styles.title}>{merchantName ? `${merchantName} support` : "Customer Support"}</h1>
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
                  onSpeak={message.role === "AGENT" && !message.id.startsWith("local_") ? () => void playAgentMessage(message, { manual: true }) : undefined}
                  speaking={speakingMessageId === message.id}
                  voicePhase={speakingMessageId === message.id ? voicePhase : "idle"}
                />
              ))}
              {activity ? <AgentActivityLog activity={activity} /> : null}
              {outcome && outcome.kind !== "ESCALATED" ? <RefundOutcomeCard outcome={outcome} /> : null}
              {detail.workspace.escalation ? <EscalationCard escalation={detail.workspace.escalation} /> : null}
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
              merchantName={merchantName}
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
                Agent replies play automatically. Microphone turns are transcribed, then sent through the same refund agent and policy as typed messages.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <aside className={styles.contextArea}>
        {detail ? (
          <ContextPanel customer={detail.customer} order={detail.order} workspace={detail.workspace} />
        ) : entry?.portal ? (
          <SupportPortalPanel merchantName={merchantName} />
        ) : (
          <HostedSupportPanel />
        )}
      </aside>
    </div>
  );
}
