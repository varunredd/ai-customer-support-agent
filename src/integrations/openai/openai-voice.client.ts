export interface RealtimeTranscriptionCredential {
  value: string;
  expiresAt: number;
  sessionId: string | null;
}

export interface VoiceSpeechResult {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
}

export class OpenAIVoiceError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "OpenAIVoiceError";
    this.code = code;
    this.status = status;
  }
}

type FetchLike = typeof fetch;

function requireApiKey(apiKey: string | undefined) {
  if (!apiKey?.trim()) {
    throw new OpenAIVoiceError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is not configured.");
  }
  return apiKey.trim();
}

function transcribeModel() {
  const requested = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";
  // gpt-live-transcribe rejects server VAD, which this take-home uses for one-turn microphone capture.
  if (requested === "gpt-live-transcribe") return "gpt-4o-mini-transcribe";
  return requested;
}

function safeVoice(value: string | undefined) {
  const voice = value?.trim() || "marin";
  const allowed = new Set([
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ]);
  return allowed.has(voice) ? voice : "marin";
}

export class OpenAIVoiceClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly apiKey = process.env.OPENAI_API_KEY,
  ) {}

  async createTranscriptionClientSecret(input: {
    keywords: string[];
    prompt: string;
    safetyIdentifier: string;
  }): Promise<RealtimeTranscriptionCredential> {
    const response = await this.fetchImpl("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey(this.apiKey)}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": input.safetyIdentifier,
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 60,
        },
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000,
              },
              noise_reduction: {
                type: "near_field",
              },
              transcription: {
                model: transcribeModel(),
                language: "en",
                prompt: [input.prompt, ...input.keywords].filter(Boolean).join(" ").slice(0, 900),
              },
              turn_detection: {
                type: "server_vad",
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
                threshold: 0.5,
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { error?: { message?: unknown; param?: unknown } };
        const message = typeof payload.error?.message === "string" ? payload.error.message : "";
        const param = typeof payload.error?.param === "string" ? payload.error.param : "";
        detail = [param, message].filter(Boolean).join(": ");
      } catch {
        detail = "";
      }
      if (detail) console.error(`OpenAI realtime client_secrets failed (${response.status}): ${detail}`);
      throw new OpenAIVoiceError(
        "OPENAI_REALTIME_CREDENTIAL_FAILED",
        "Unable to create a realtime transcription credential.",
        response.status,
      );
    }

    const payload = (await response.json()) as {
      value?: unknown;
      expires_at?: unknown;
      session?: { id?: unknown };
    };

    if (typeof payload.value !== "string" || typeof payload.expires_at !== "number") {
      throw new OpenAIVoiceError(
        "OPENAI_REALTIME_CREDENTIAL_INVALID",
        "OpenAI returned an invalid realtime credential payload.",
        response.status,
      );
    }

    return {
      value: payload.value,
      expiresAt: payload.expires_at,
      sessionId: typeof payload.session?.id === "string" ? payload.session.id : null,
    };
  }

  async synthesizeSpeech(text: string): Promise<VoiceSpeechResult> {
    const clean = text.trim();
    if (!clean) throw new OpenAIVoiceError("VOICE_TEXT_EMPTY", "Speech text cannot be empty.");
    if (clean.length > 4000) {
      throw new OpenAIVoiceError("VOICE_TEXT_TOO_LONG", "Speech text is too long to synthesize safely.");
    }

    const response = await this.fetchImpl("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey(this.apiKey)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts",
        voice: safeVoice(process.env.OPENAI_TTS_VOICE),
        input: clean,
        response_format: "mp3",
        instructions: "Speak clearly, calmly, and concisely as an AI customer support assistant.",
      }),
    });

    if (!response.ok || !response.body) {
      throw new OpenAIVoiceError(
        "OPENAI_TTS_FAILED",
        "Unable to generate the support response audio.",
        response.status,
      );
    }

    return {
      body: response.body as ReadableStream<Uint8Array>,
      contentType: response.headers.get("content-type") || "audio/mpeg",
    };
  }
}
