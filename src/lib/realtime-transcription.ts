export type RealtimeTranscriptionEvent =
  | { kind: "delta"; itemId: string | null; text: string }
  | { kind: "completed"; itemId: string | null; text: string }
  | { kind: "speech_started" }
  | { kind: "speech_stopped" }
  | { kind: "error"; message: string }
  | { kind: "ignored" };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseRealtimeTranscriptionEvent(raw: string): RealtimeTranscriptionEvent {
  let payload: Record<string, unknown> | null;
  try {
    payload = object(JSON.parse(raw));
  } catch {
    return { kind: "ignored" };
  }
  if (!payload || typeof payload.type !== "string") return { kind: "ignored" };

  if (payload.type === "conversation.item.input_audio_transcription.delta") {
    return {
      kind: "delta",
      itemId: typeof payload.item_id === "string" ? payload.item_id : null,
      text: typeof payload.delta === "string" ? payload.delta : "",
    };
  }

  if (payload.type === "conversation.item.input_audio_transcription.completed") {
    return {
      kind: "completed",
      itemId: typeof payload.item_id === "string" ? payload.item_id : null,
      text: typeof payload.transcript === "string" ? payload.transcript.trim() : "",
    };
  }

  if (payload.type === "input_audio_buffer.speech_started") return { kind: "speech_started" };
  if (payload.type === "input_audio_buffer.speech_stopped") return { kind: "speech_stopped" };

  if (payload.type === "error") {
    const error = object(payload.error);
    return {
      kind: "error",
      message: typeof error?.message === "string" ? error.message : "Realtime transcription failed.",
    };
  }

  return { kind: "ignored" };
}
