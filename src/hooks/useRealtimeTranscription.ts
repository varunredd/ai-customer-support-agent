"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseRealtimeTranscriptionEvent } from "@/lib/realtime-transcription";

export type VoiceInputState = "IDLE" | "CONNECTING" | "LISTENING" | "TRANSCRIBING" | "UNSUPPORTED" | "ERROR";

interface ClientSecretPayload {
  value?: unknown;
  expiresAt?: unknown;
}

function supported() {
  return typeof window !== "undefined"
    && typeof RTCPeerConnection !== "undefined"
    && typeof navigator.mediaDevices?.getUserMedia === "function";
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : fallback;
  } catch {
    return fallback;
  }
}

export function useRealtimeTranscription(input: {
  sessionId: string | null;
  disabled?: boolean;
  onFinalTranscript: (transcript: string) => void | Promise<void>;
}) {
  const [state, setState] = useState<VoiceInputState>("IDLE");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    finishedRef.current = true;
    setPartialTranscript("");
    setState(supported() ? "IDLE" : "UNSUPPORTED");
  }, [cleanup]);

  useEffect(() => {
    if (!supported()) setState("UNSUPPORTED");
    return cleanup;
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!input.sessionId || input.disabled || state === "CONNECTING" || state === "LISTENING" || state === "TRANSCRIBING") return;
    if (!supported()) {
      setState("UNSUPPORTED");
      setError("Realtime microphone input is not supported in this browser. You can continue by typing.");
      return;
    }

    finishedRef.current = false;
    setError(null);
    setPartialTranscript("");
    setState("CONNECTING");

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = media;
      if (finishedRef.current) {
        cleanup();
        return;
      }

      const credentialResponse = await fetch("/api/voice/realtime/client-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: input.sessionId }),
      });
      if (!credentialResponse.ok) {
        throw new Error(await responseError(credentialResponse, "Unable to start voice input."));
      }
      const credential = (await credentialResponse.json()) as ClientSecretPayload;
      if (typeof credential.value !== "string") throw new Error("Voice credential response was invalid.");
      if (finishedRef.current) {
        cleanup();
        return;
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      media.getAudioTracks().forEach((track) => peer.addTrack(track, media));

      const dataChannel = peer.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        if (!finishedRef.current) setState("LISTENING");
      });

      dataChannel.addEventListener("message", (event) => {
        if (typeof event.data !== "string" || finishedRef.current) return;
        const parsed = parseRealtimeTranscriptionEvent(event.data);
        if (parsed.kind === "delta") {
          if (parsed.text) setPartialTranscript((previous) => `${previous}${parsed.text}`);
          setState("TRANSCRIBING");
          return;
        }
        if (parsed.kind === "speech_started") {
          setState("LISTENING");
          return;
        }
        if (parsed.kind === "speech_stopped") {
          setState("TRANSCRIBING");
          return;
        }
        if (parsed.kind === "completed") {
          const transcript = parsed.text.trim();
          if (!transcript) return;
          finishedRef.current = true;
          cleanup();
          setPartialTranscript("");
          setState("IDLE");
          void input.onFinalTranscript(transcript);
          return;
        }
        if (parsed.kind === "error") {
          finishedRef.current = true;
          cleanup();
          setPartialTranscript("");
          setState("ERROR");
          setError("Voice transcription was interrupted. You can retry or continue by typing.");
        }
      });

      dataChannel.addEventListener("error", () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        cleanup();
        setState("ERROR");
        setError("The voice connection was interrupted. You can retry or continue by typing.");
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("Unable to create the realtime audio offer.");

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) throw new Error("Unable to connect to realtime transcription.");

      const answerSdp = await sdpResponse.text();
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });

      timeoutRef.current = setTimeout(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        cleanup();
        setState("ERROR");
        setError("No complete speech turn was detected. Try the microphone again or type your request.");
      }, 45000);
    } catch (caught) {
      finishedRef.current = true;
      cleanup();
      setPartialTranscript("");
      setState("ERROR");
      if (caught instanceof DOMException && (caught.name === "NotAllowedError" || caught.name === "SecurityError")) {
        setError("Microphone permission was denied. Enable microphone access or continue by typing.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to start voice input. You can continue by typing.");
      }
    }
  }, [cleanup, input, state]);

  const toggle = useCallback(() => {
    if (state === "CONNECTING" || state === "LISTENING" || state === "TRANSCRIBING") {
      stop();
      return;
    }
    void start();
  }, [start, state, stop]);

  return {
    state,
    partialTranscript,
    error,
    start,
    stop,
    toggle,
    isActive: state === "CONNECTING" || state === "LISTENING" || state === "TRANSCRIBING",
  };
}
