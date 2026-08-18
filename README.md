# AI Customer Support Agent

A production-minded Next.js take-home project for Jobform Automator: an AI customer-support agent that investigates e-commerce refund requests, calls backend tools, applies deterministic policy, and either executes or denies refunds with a persisted audit trail.

The key engineering boundary is deliberate: **the LLM orchestrates; deterministic server-side code owns refund eligibility, amount, idempotency, and ledger writes.** Voice is only another input/output transport around the same support path.

## Submission status

All six delivery phases are complete:

- Domain model + strict refund policy
- SQLite persistence + deterministic refund execution
- OpenAI Responses API tool-calling agent
- Live customer chat + SSE observability + admin reads
- Product integration hardening
- Optional microphone transcription + persisted-message TTS
- Submission hardening, demo reset, CI, and walkthrough package

Local certification target: **34 tests + TypeScript + production build**.

## Product routes

- `/support` — normal product flow: choose a CRM customer, choose one of that customer's orders, then start support.
- `/demo` — deterministic evaluator launcher.
- `/support?scenario=approve` — standard approval shortcut.
- `/support?scenario=deny` — final-sale denial shortcut.
- `/support?scenario=retry` — failure/retry shortcut when demo failure injection is enabled.
- `/admin` — persisted overview.
- `/admin/runs` — live/persisted structured agent activity.
- `/admin/customers` — CRM directory and customer detail.
- `/admin/refunds` — completed refund ledger with Agent Run traceability.
- `/admin/policy` — read-only active refund policy.

## Architecture

```text
Typed message ---------------------------+
                                         |
Microphone -> Realtime transcription ----+
                                         |
                                         v
                             POST /api/support/chat
                                         |
                                         v
                              Support Agent Loop
                              OpenAI Responses API
                                         |
                        +----------------+----------------+
                        |                |                |
                        v                v                v
                   CRM / order      policy lookup   refund tools
                        |                |                |
                        +----------------+----------------+
                                         |
                                         v
                              Deterministic refund engine
                                         |
                                         v
                           Atomic/idempotent execution
                                         |
                                         v
                                      SQLite
                         runs / events / messages / refunds
                                         |
                         +---------------+---------------+
                         |                               |
                         v                               v
                    Admin UI                    persisted AGENT message
                                                         |
                                                         v
                                                   server-side TTS
```

### Authority model

The model may:

- decide which approved tool to call,
- ask clarifying questions,
- summarize customer-visible results.

The model may not:

- authorize money movement,
- calculate the authoritative refund amount,
- choose the authenticated customer identity,
- choose the authoritative request timestamp,
- choose execution idempotency keys,
- write the refund ledger directly.

`execute_refund` re-runs deterministic eligibility inside an immediate SQLite transaction before writing a completed refund. This makes a model attempt to skip an earlier validation step non-authoritative.

## Clean-clone setup

### Requirements

- Node.js 20.9+
- npm
- OpenAI API key for live model/voice requests

The deterministic tests and production build do not require a live OpenAI request.

### 1. Install

```bash
npm ci
```

### 2. Configure local environment

macOS/Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Set the server-only key:

```text
OPENAI_API_KEY=your_key_here
```

Never expose it through a `NEXT_PUBLIC_*` variable.

### 3. Reset deterministic demo state

```bash
npm run demo:reset
```

This rebuilds the local SQLite database, seeds the 15 CRM customers + six demo orders, retains only the intentional historical partial-refund row, and verifies that runtime runs/messages/sessions are empty.

### 4. Run the full gate

```bash
npm run submission:check
```

That performs:

1. tracked-file submission audit,
2. demo-fixture certification,
3. TypeScript typecheck,
4. all automated tests,
5. Next.js production build.

### 5. Start the app

```bash
npm run dev
```

Open the local URL printed by Next.js.

## Deterministic evaluator demo

Always start a recorded walkthrough with:

```bash
npm run demo:reset
```

### Approval

Open `/support?scenario=approve` or launch **Standard approval** from `/demo`.

Suggested request:

> I want to return my Studio Headphones. I changed my mind, they are unopened, and I want to return quantity 1.

Expected product result: **APPROVE · $89.00 item refund**. Shipping is intentionally excluded from automated refund amount.

### Policy denial

Open `/support?scenario=deny` or launch **Policy denial** from `/demo`.

Suggested request:

> I want to return the Limited Edition Tee. I changed my mind, it is unopened, and I want to return quantity 1.

Expected product result: **DENY · final-sale rule** and **no new refund ledger row**.

### Failure → retry → success

Set this only for the retry walkthrough:

```text
ENABLE_DEMO_FAILURES=true
```

Restart the dev server, then open `/support?scenario=retry`.

The run timeline should show a transient order-tool failure, retry, and later success through persisted structured events. Disable failure injection again after the demo.

## Voice bonus

After a support session starts, the microphone performs one transcription-only WebRTC turn. The final transcript is submitted to the exact same `/api/support/chat` endpoint as typed input.

Current default transcription model:

```text
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

The Phase 5 runtime also remaps the legacy `gpt-live-transcribe` environment value to `gpt-4o-mini-transcribe` because the recorded one-turn server-VAD configuration was not accepted with that legacy value during live certification.

Spoken replies are generated from the content of an already-persisted `AGENT` message. The browser sends only `sessionId` + `messageId`; it cannot turn the speech endpoint into an arbitrary TTS proxy.

Typed chat remains available when microphone permission, WebRTC, transcription, TTS, or autoplay fails.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI credential | required for live agent/voice |
| `OPENAI_MODEL` | Responses API model | `gpt-4o-mini` |
| `OPENAI_TRANSCRIBE_MODEL` | Realtime microphone transcription | `gpt-4o-mini-transcribe` |
| `OPENAI_TTS_MODEL` | Spoken assistant-response model | `gpt-4o-mini-tts` |
| `OPENAI_TTS_VOICE` | AI-generated support voice | `marin` |
| `DATABASE_PATH` | Local SQLite file | `.data/jobform-support.sqlite` |
| `AGENT_MAX_TURNS` | Model-loop safety bound | `10` |
| `AGENT_TOOL_MAX_ATTEMPTS` | Automatic tool attempts | `3` |
| `AGENT_TOOL_TIMEOUT_MS` | Per-tool timeout | `5000` |
| `ENABLE_DEMO_FAILURES` | Local retry-demo injection | `false` |

## Useful commands

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm test
npm run verify
npm run db:migrate
npm run db:seed
npm run db:reset
npm run demo:reset
npm run demo:check
npm run demo:agent -- approve
npm run demo:agent -- deny
npm run demo:agent -- retry
npm run submission:audit
npm run submission:check
```

## Observability without chain-of-thought

The admin timeline stores and renders structured operational events such as:

- request received,
- model/tool lifecycle,
- policy checks,
- retry/failure states,
- final decision,
- refund execution.

It intentionally does **not** store or display hidden model chain-of-thought.

## Persistence and deployment note

SQLite is intentional for this self-contained take-home. A hosted deployment therefore needs a writable persistent filesystem/volume. Do not deploy the current database unchanged to an ephemeral serverless filesystem and expect demo state to survive restarts.

For the hiring submission, the supported reproducible path is a clean clone + local SQLite reset + `npm run submission:check` + `npm run dev`. The assignment requires a public GitHub repository and video demo, not a hosted production URL.

## Scope boundaries

This is a hiring vertical slice, not a full commerce platform. Production authentication/SSO, a real payment processor, external CRM integration, multi-tenant authorization, and production database migration are intentionally out of scope.

The important production-style boundaries that are implemented are refund authority, server-side identity binding within a support session, idempotency, deterministic policy enforcement, structured observability, and secret isolation.

## Repository hygiene

- `.env*` files are ignored except `.env.example`.
- `.data/`, SQLite/WAL files, build output, logs, ZIP exports, and `node_modules` are ignored.
- GitHub Actions runs `npm ci`, repository audit, deterministic demo reset, and `npm run verify`.
- `npm run submission:audit` inspects tracked files for accidental env/runtime artifacts and obvious OpenAI secrets.

## Documentation

- `docs/architecture.md` — final architecture and authority boundaries.
- `docs/refund-policy.md` — human-readable refund policy.
- `docs/phase-2.md` — persistence, agent loop, execution safety.
- `docs/phase-3.md` — live vertical slice and observability.
- `docs/phase-4.md` — product integration hardening.
- `docs/phase-5.md` — voice transport.
- `docs/phase-6.md` — final hardening and submission certification.
- `docs/loom-walkthrough.md` — 7–10 minute recording plan.
- `PHASES.md` — delivery history and acceptance gates.
