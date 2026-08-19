import { getDatabase } from "@/db/database";
import { OpenAIVoiceClient, OpenAIVoiceError } from "@/integrations/openai/openai-voice.client";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import { assertSupportSessionAccess, SupportAccessError } from "@/security/support-access";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import { SupportSessionNotFoundError } from "@/services/support/support-session.service";
import {
  getSpeakableAgentMessage,
  VoiceMessageNotAgentError,
  VoiceMessageNotFoundError,
} from "@/services/voice/voice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let sessionId: string;
  let messageId: string;
  try {
    const body = asObject(await request.json());
    sessionId = readNonEmptyString(body, "sessionId", 128);
    messageId = readNonEmptyString(body, "messageId", 128);
  } catch (error) {
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }

  try {
    const db = getDatabase();
    assertSupportSessionAccess(db, sessionId, request);
    consumeRateLimit(db, { key: `voice-speech:${sessionId}`, limit: 30, windowMs: 60_000 });
    const message = await getSpeakableAgentMessage(db, { sessionId, messageId });
    const speech = await new OpenAIVoiceClient().synthesizeSpeech(message.content);
    return new Response(speech.body, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: error.code, message: "Too many voice requests. Please wait before trying again." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof SupportAccessError) return jsonError(error.code === "SUPPORT_SESSION_NOT_FOUND" ? 404 : 401, error.code, error.message);
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    if (error instanceof VoiceMessageNotFoundError) return jsonError(404, error.code, error.message);
    if (error instanceof VoiceMessageNotAgentError) return jsonError(403, error.code, error.message);
    if (error instanceof OpenAIVoiceError) {
      if (error.code === "OPENAI_API_KEY_MISSING") {
        return jsonError(503, "VOICE_NOT_CONFIGURED", "Voice playback is not configured.");
      }
      return jsonError(503, "VOICE_TEMPORARILY_UNAVAILABLE", "Voice playback is temporarily unavailable.");
    }
    return jsonError(500, "VOICE_PLAYBACK_FAILED", "Unable to generate voice playback.");
  }
}
