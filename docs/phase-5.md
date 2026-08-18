# Phase 5 — Voice Bonus

Phase 5 adds microphone input and spoken assistant output without creating a second refund agent.

## Architecture decision

The Realtime API is used as a **speech transport**, not as another reasoning/orchestration authority.

```text
Microphone
   |
   v
OpenAI Realtime transcription (WebRTC)
   |
   | final transcript
   v
POST /api/support/chat
   |
   v
Existing Responses API support agent
   |
   +--> same CRM/order tools
   +--> same deterministic refund policy
   +--> same atomic refund execution
   |
   v
Persisted AGENT message
   |
   +--> text remains visible
   |
   +--> POST /api/voice/speech
            |
            v
       OpenAI TTS audio
```

No Realtime refund tools are registered. The browser's Realtime session is created with `type: "transcription"`, so it cannot call refund functions, approve a refund, or write the ledger.

## Realtime browser credential

`POST /api/voice/realtime/client-secret` validates the existing server-bound support session before minting a short-lived OpenAI Realtime client secret.

The server attaches a transcription-only session configuration using:

- `gpt-4o-mini-transcribe` by default,
- 24 kHz PCM input,
- near-field noise reduction,
- server VAD,
- order/product vocabulary as transcription hints.

During live Phase 5 certification, the one-turn server-VAD configuration was rejected when the environment requested `gpt-live-transcribe`. The implementation therefore defaults to `gpt-4o-mini-transcribe` and defensively remaps that legacy environment value to the certified model.

The long-lived `OPENAI_API_KEY` never leaves the Next.js server. When minting the client secret, the server also attaches a SHA-256-derived, privacy-preserving safety identifier based on the bound CRM customer; the browser cannot choose or override it. The browser receives only the short-lived Realtime credential and uses it to establish WebRTC directly with OpenAI.

Each microphone activation handles one speech turn. A completed transcript is then submitted through the exact same `/api/support/chat` SSE endpoint used by typed input. Text remains available whenever the microphone, WebRTC connection, or transcription service fails.

## Spoken response safety

`POST /api/voice/speech` does not accept arbitrary text to synthesize. It accepts only:

- `sessionId`, and
- `messageId`.

The server verifies that the requested message is a persisted `AGENT` message belonging to that support session, then synthesizes that persisted text using the configured TTS model (`gpt-4o-mini-tts` by default in this build).

This keeps browser-controlled text from becoming an unrestricted TTS proxy and guarantees that spoken output matches a persisted support response.

The support UI visibly discloses that spoken responses are AI-generated. Text is always retained as the fallback and source of truth.

## Interaction model

- Click the microphone once to begin a single voice turn.
- Speak naturally and pause when finished.
- Realtime VAD completes the turn and returns the transcript.
- The transcript is submitted to the existing support agent automatically.
- The normal agent timeline/refund ledger records the same tool and policy activity as a typed request.
- The persisted agent reply is spoken automatically for a voice-originated turn.
- Every persisted agent message also has a **Listen** action for replay.
- Clicking the active microphone button stops voice capture without submitting partial speech.

## Failure behavior

Voice is a bonus transport and cannot take the text product down.

- Microphone denied -> typed chat remains enabled.
- Browser lacks WebRTC/getUserMedia -> typed chat remains enabled.
- Realtime credential/transcription failure -> typed chat remains enabled.
- TTS failure/autoplay restriction -> persisted text remains visible and the user can retry **Listen**.
- Support-agent/refund failures continue to use the Phase 3/4 persisted run and financial safety behavior.

## Phase boundary

Phase 5 does not change:

- refund rules,
- model refund authority,
- tool schemas,
- agent orchestration,
- SQLite refund execution,
- idempotency,
- demo fixtures,
- production authentication scope.

Phase 6 owns final clone reproducibility, README/GitHub hygiene, deterministic demo reset, and the recording/submission package.
