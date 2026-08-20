import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@/db/database";
import { seedCatalog } from "@/db/seed";
import { OpenAIVoiceClient } from "@/integrations/openai/openai-voice.client";
import { parseRealtimeTranscriptionEvent } from "@/lib/realtime-transcription";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { createSupportSession } from "@/services/support/support-session.service";
import {
  createVoiceTranscriptionCredential,
  getSpeakableAgentMessage,
  VoiceMessageNotAgentError,
  VoiceMessageNotFoundError,
} from "@/services/voice/voice.service";

test("voice credential is a short-lived transcription-only Realtime session and never a second refund agent", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  const support = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
  let requestUrl = "";
  let requestAuthorization = "";
  let safetyIdentifier = "";
  let requestBody: Record<string, unknown> = {};

  const mockFetch: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    safetyIdentifier = new Headers(init?.headers).get("openai-safety-identifier") ?? "";
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      value: "ek_phase5_test",
      expires_at: 1_800_000_000,
      session: { id: "sess_voice_test", type: "transcription" },
    });
  };

  try {
    const client = new OpenAIVoiceClient(mockFetch, "server_api_key_test");
    const credential = await createVoiceTranscriptionCredential(db, support.session.id, client);

    assert.equal(requestUrl, "https://api.openai.com/v1/realtime/client_secrets");
    assert.equal(requestAuthorization, "Bearer server_api_key_test");
    assert.match(safetyIdentifier, /^[a-f0-9]{64}$/);
    assert.equal(credential.value, "ek_phase5_test");
    assert.equal(credential.expiresAt, 1_800_000_000);

    const expires = requestBody.expires_after as { seconds?: number };
    const session = requestBody.session as Record<string, unknown>;
    assert.equal(expires.seconds, 60);
    assert.equal(session.type, "transcription");
    assert.equal("tools" in session, false);
    assert.equal("instructions" in session, false);

    const audio = session.audio as { input?: Record<string, unknown> };
    const transcription = audio.input?.transcription as { model?: string; language?: string; prompt?: string };
    assert.equal(transcription.model, "gpt-4o-mini-transcribe");
    assert.equal(transcription.language, "en");
    assert.match(String(transcription.prompt), /ord_8901/);
    assert.match(String(transcription.prompt), /Studio Headphones/);
  } finally {
    db.close();
  }
});

test("voice playback accepts only persisted agent messages bound to the same support session", async () => {
  const db = createDatabase(":memory:");
  seedCatalog(db);
  try {
    const first = await createSupportSession(db, { customerId: "cus_001", orderId: "ord_8901" });
    const second = await createSupportSession(db, { customerId: "cus_002", orderId: "ord_8902" });
    const sessions = new SupportSessionRepository(db);
    const customerMessage = sessions.appendMessage({
      sessionId: first.session.id,
      role: "CUSTOMER",
      content: "I want a refund.",
    });

    const welcome = first.messages[0]!;
    const speakable = await getSpeakableAgentMessage(db, {
      sessionId: first.session.id,
      messageId: welcome.id,
    });
    assert.equal(speakable.role, "AGENT");
    assert.equal(speakable.content, welcome.content);

    await assert.rejects(
      getSpeakableAgentMessage(db, { sessionId: first.session.id, messageId: customerMessage.id }),
      VoiceMessageNotAgentError,
    );
    await assert.rejects(
      getSpeakableAgentMessage(db, { sessionId: second.session.id, messageId: welcome.id }),
      VoiceMessageNotFoundError,
    );
  } finally {
    db.close();
  }
});

test("TTS request synthesizes persisted response text with a server-only key", async () => {
  const previousModel = process.env.OPENAI_TTS_MODEL;
  const previousVoice = process.env.OPENAI_TTS_VOICE;
  delete process.env.OPENAI_TTS_MODEL;
  delete process.env.OPENAI_TTS_VOICE;
  let authorization = "";
  let body: Record<string, unknown> = {};
  const mockFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/audio/speech");
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  };

  try {
    const client = new OpenAIVoiceClient(mockFetch, "server_voice_key");
    const result = await client.synthesizeSpeech("Your refund is not eligible under the active policy.");

    assert.equal(authorization, "Bearer server_voice_key");
    assert.equal(body.model, "tts-1");
    assert.equal(body.voice, "nova");
    assert.equal(body.response_format, "mp3");
    assert.equal(body.input, "Your refund is not eligible under the active policy.");
    assert.equal(body.instructions, undefined);
    assert.equal(result.contentType, "audio/mpeg");
    assert.ok(result.body);
  } finally {
    if (previousModel === undefined) delete process.env.OPENAI_TTS_MODEL;
    else process.env.OPENAI_TTS_MODEL = previousModel;
    if (previousVoice === undefined) delete process.env.OPENAI_TTS_VOICE;
    else process.env.OPENAI_TTS_VOICE = previousVoice;
  }
});

test("Realtime transcription event parser preserves deltas and final transcript", () => {
  assert.deepEqual(
    parseRealtimeTranscriptionEvent(JSON.stringify({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item_1",
      delta: "I want ",
    })),
    { kind: "delta", itemId: "item_1", text: "I want " },
  );

  assert.deepEqual(
    parseRealtimeTranscriptionEvent(JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_1",
      transcript: "  I want a refund.  ",
    })),
    { kind: "completed", itemId: "item_1", text: "I want a refund." },
  );
});

test("Realtime transcription parser reduces provider errors to one typed event", () => {
  assert.deepEqual(
    parseRealtimeTranscriptionEvent(JSON.stringify({
      type: "error",
      error: { message: "provider detail" },
    })),
    { kind: "error", message: "provider detail" },
  );
  assert.deepEqual(parseRealtimeTranscriptionEvent("not-json"), { kind: "ignored" });
});
