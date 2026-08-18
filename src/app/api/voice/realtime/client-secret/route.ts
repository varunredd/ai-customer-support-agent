import { getDatabase } from "@/db/database";
import { OpenAIVoiceError } from "@/integrations/openai/openai-voice.client";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import {
  createVoiceTranscriptionCredential,
  VoiceSessionClosedError,
} from "@/services/voice/voice.service";
import { SupportSessionNotFoundError } from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let sessionId: string;
  try {
    const body = asObject(await request.json());
    sessionId = readNonEmptyString(body, "sessionId", 128);
  } catch (error) {
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }

  try {
    const credential = await createVoiceTranscriptionCredential(getDatabase(), sessionId);
    return Response.json({ value: credential.value, expiresAt: credential.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    if (error instanceof VoiceSessionClosedError) return jsonError(409, error.code, error.message);
    if (error instanceof OpenAIVoiceError) {
      if (error.code === "OPENAI_API_KEY_MISSING") {
        return jsonError(503, "VOICE_NOT_CONFIGURED", "Voice support is not configured. Continue by typing.");
      }
      return jsonError(503, "VOICE_TEMPORARILY_UNAVAILABLE", "Voice input is temporarily unavailable. Continue by typing.");
    }
    return jsonError(500, "VOICE_SESSION_FAILED", "Unable to start voice input. Continue by typing.");
  }
}
