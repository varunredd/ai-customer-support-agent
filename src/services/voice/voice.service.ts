import { createHash } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { SupportMessage } from "@/domain/support/types";
import { OpenAIVoiceClient, type RealtimeTranscriptionCredential } from "@/integrations/openai/openai-voice.client";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { getSupportSessionDetail, SupportSessionNotFoundError } from "@/services/support/support-session.service";

export class VoiceSessionClosedError extends Error {
  readonly code = "VOICE_SESSION_CLOSED";
}

export class VoiceMessageNotFoundError extends Error {
  readonly code = "VOICE_MESSAGE_NOT_FOUND";
}

export class VoiceMessageNotAgentError extends Error {
  readonly code = "VOICE_MESSAGE_NOT_AGENT";
}

function sanitizeKeyword(value: string) {
  return value.replace(/[<>\r\n]/g, " ").trim().slice(0, 120);
}

export async function createVoiceTranscriptionCredential(
  db: AppDatabase,
  sessionId: string,
  voiceClient = new OpenAIVoiceClient(),
): Promise<RealtimeTranscriptionCredential> {
  const detail = await getSupportSessionDetail(db, sessionId);
  if (detail.session.status !== "OPEN") {
    throw new VoiceSessionClosedError("Voice input is unavailable for a closed support session.");
  }

  const itemNames = detail.order.items.map((item) => sanitizeKeyword(item.name)).filter(Boolean);
  const keywords = [sanitizeKeyword(detail.order.id), ...itemNames].filter(Boolean).slice(0, 20);
  const prompt = [
    "E-commerce customer support conversation about a refund request.",
    `Order ${detail.order.id}.`,
    itemNames.length ? `Products: ${itemNames.join(", ")}.` : "",
    "Expect words such as refund, return, unopened, damaged, quantity, final sale, order, and delivery.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 900);

  const safetyIdentifier = createHash("sha256")
    .update(`jobform-support:${detail.customer.id}`)
    .digest("hex");

  return voiceClient.createTranscriptionClientSecret({ keywords, prompt, safetyIdentifier });
}

export async function getSpeakableAgentMessage(
  db: AppDatabase,
  input: { sessionId: string; messageId: string },
): Promise<SupportMessage> {
  const sessions = new SupportSessionRepository(db);
  const session = sessions.findById(input.sessionId);
  if (!session) throw new SupportSessionNotFoundError("Support session was not found.");

  const message = sessions.findMessageById(input.messageId);
  if (!message || message.sessionId !== input.sessionId) {
    throw new VoiceMessageNotFoundError("Support message was not found for this session.");
  }
  if (message.role !== "AGENT") {
    throw new VoiceMessageNotAgentError("Only persisted agent messages can be synthesized.");
  }
  return message;
}

const SPEECH_CACHE_LIMIT = 40;
const speechCache = new Map<string, { bytes: Uint8Array; contentType: string }>();

function speechCacheKey(sessionId: string, messageId: string) {
  return `${sessionId}:${messageId}`;
}

export function getCachedSpeech(sessionId: string, messageId: string) {
  return speechCache.get(speechCacheKey(sessionId, messageId)) ?? null;
}

export function setCachedSpeech(sessionId: string, messageId: string, bytes: Uint8Array, contentType: string) {
  if (speechCache.size >= SPEECH_CACHE_LIMIT) {
    const oldest = speechCache.keys().next().value;
    if (oldest) speechCache.delete(oldest);
  }
  speechCache.set(speechCacheKey(sessionId, messageId), { bytes, contentType });
}

export async function bufferAndCacheSpeech(
  sessionId: string,
  messageId: string,
  stream: ReadableStream<Uint8Array>,
  contentType: string,
) {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  setCachedSpeech(sessionId, messageId, bytes, contentType);
}
