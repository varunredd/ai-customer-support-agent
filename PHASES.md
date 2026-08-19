# Delivery History

Jobform is a standalone customer-support product. This file is a historical delivery log, not the product contract.

## Phase 1 — Domain foundation and policy engine — COMPLETE

Delivered:
- Next.js App Router baseline.
- 15 CRM fixtures and six order fixtures.
- Strict refund policy document + machine-readable policy.
- Repository contracts.
- Deterministic refund eligibility service.
- Initial tool-facing application functions.
- Core policy tests.

## Phase 2 — Persistence, LLM agent loop, execution safety — COMPLETE

Delivered:
- Versioned SQLite migration flow and deterministic seed/reset scripts.
- `customers`, `orders`, `order_items`, `refunds`, `agent_runs`, and `agent_events` persistence.
- OpenAI Responses API raw function-calling loop.
- Strict tools for customer lookup, order lookup, policy retrieval, deterministic validation, and refund execution.
- Authenticated-customer authorization checks at the tool boundary.
- Server-owned request timestamp and server-generated execution idempotency key.
- Maximum-turn protection, malformed arguments, structured errors, timeouts, abort signals, and retries.
- Structured persisted observability suitable for the admin UI without hidden chain-of-thought.
- Atomic refund execution with policy revalidation inside the transaction.
- Item-level refund quantity accounting and remaining-balance protection.
- Exact idempotent replay of the original persisted refund evaluation.
- Approval, denial, bypass, authorization, retry, idempotency, and failure tests.

Acceptance gate:
- Model orchestration cannot bypass deterministic policy.
- Same refund execution within a run cannot double-refund.
- A final-sale refund remains blocked even if the model calls execution directly.
- Model cannot switch away from authenticated customer context.
- Retry/failure activity is persisted as structured events.

## Phase 3 — Customer chat API and real-time observability — COMPLETE

Delivered:
- Persisted support sessions and customer/agent messages.
- Customer/order-bound support session bootstrap.
- SSE support-chat endpoint wired to the real OpenAI tool loop.
- Correlation from support message → agent run → tool/policy events → refund.
- Live structured agent-event callback from the orchestration service.
- SSE admin event tail for in-progress runs.
- Persisted run summary/detail APIs and refund-ledger API.
- `/support`, `/admin`, `/admin/runs`, `/admin/customers`, and `/admin/refunds` switched to persisted backend state.
- Approval, denial, and guarded retry demo routes.
- Phase 3 persistence/observability tests.

Acceptance gate:
- Customer message → model → tools → deterministic decision → customer response works from the UI.
- Admin timeline consumes persisted events rather than preview reasoning.
- Refund ledger contains only executed money movement; denials remain auditable in runs.
- No frontend refund decision logic exists.

## Phase 4 — Product integration hardening — COMPLETE

Delivered:
- Normal `/support` entry flow with CRM customer selection and customer-owned order selection.
- Server-backed support-context API; customer/order lists come from SQLite rather than browser fixtures.
- Existing deterministic `/demo` shortcuts retained for approve, deny, and guarded retry walkthroughs.
- Demo scenario configuration isolated from the normal support product flow.
- Customer-facing approval/denial/completed-refund presentation driven only by persisted agent events.
- Safer support failure messages that do not surface provider/internal error details.
- Polished session-start, loading, empty-order, working, failure, and new-session states.
- Agent Runs URL selection, refresh/reconnect handling, outcome summaries, and live-state polish.
- Refund ledger → Agent Run traceability.
- Legacy hardcoded agent-run preview state removed.
- Phase 4 integration tests for support context and backend-event outcome projection.

Acceptance gate:
- UI has zero hardcoded refund decisions.
- `/support` is usable without `?scenario=` while `/demo` remains deterministic for evaluators.
- Admin logs are persisted backend events, not fake frontend reasoning.
- Loading, empty, error, retry, approval, and denial states are polished.
- `npm run verify` passes on the local installed dependency set.

## Phase 5 — Voice bonus — COMPLETE

Delivered:
- OpenAI Realtime transcription connection from the browser via WebRTC.
- Server-created 60-second Realtime client secret bound to a transcription-only session.
- Backend-derived privacy-preserving safety identifier attached when minting the Realtime client secret.
- Single-turn microphone UX with VAD-driven final transcription.
- Voice transcript routed through the existing `/api/support/chat` Responses-agent path.
- No Realtime refund tools and no second voice-only refund agent.
- Persisted-agent-message-only TTS endpoint using OpenAI speech generation.
- Automatic spoken reply for voice-originated turns plus per-message Listen replay.
- Clear AI-generated-voice disclosure and typed-text fallback for microphone/WebRTC/TTS failures.
- Phase 5 tests for credential scope, persisted-message playback authorization, TTS request safety, and Realtime event parsing.

Acceptance gate:
- Voice cannot bypass deterministic validation because it reaches refunds only through the existing support-agent endpoint.
- Realtime browser session is transcription-only and contains no refund tools.
- Browser receives only a short-lived Realtime client secret; the long-lived OpenAI key remains server-only.
- Spoken output is generated only from a persisted AGENT message bound to the current support session.
- Text remains functional when voice is unavailable.
- `npm run verify` passes locally.

## Phase 6 — Hardening, submission, and demo package — COMPLETE

Delivered:
- Final public-facing README and architecture documentation.
- Corrected voice-model documentation to the live-certified `gpt-4o-mini-transcribe` default.
- Deterministic `demo:reset` command plus explicit fixture certification.
- Git-tracked-file submission audit for secrets/runtime artifacts.
- GitHub Actions CI for install → audit → reset → verify.
- SQLite hosting/persistence guidance.
- 7–10 minute Loom walkthrough plan covering approval, denial, failure/retry, architecture, observability, and optional voice.
- Final submission/security checklist.

Acceptance gate:
- Clean clone → `npm ci` → environment setup → `npm run demo:reset` → `npm run submission:check` → `npm run dev` follows README.
- Required demo paths start from certified deterministic state.
- No secrets, local databases, generated runtime state, or overlay/source ZIPs are tracked.
- Public documentation matches the certified runtime behavior and phase boundaries.

## Production Track P0 — Launch foundation — IMPLEMENTED, LOCAL CERTIFICATION PENDING

Purpose:
- Extend the certified hiring vertical slice with the highest-value launch controls without creating a second agent or weakening deterministic refund authority.

Delivered:
- Versioned persisted refund-policy repository with atomic draft/publish lifecycle.
- Runtime policy loading in policy lookup, validation, and refund execution; every new refund records the policy version that authorized it.
- Signed HMAC business-context ingestion endpoint with timestamp validation, event-id idempotency, replay protection, and canonical CRM/order upsert.
- Durable notification outbox written in the same refund transaction, plus Resend delivery worker with provider idempotency keys and retry/dead-letter state.
- Protected internal notification-drain endpoint suitable for a scheduler/worker.
- Structured operational logging persisted separately from agent reasoning events, with sensitive metadata redaction.
- Human-escalation tool and persisted escalation queue for high-risk, unsupported, failed, or customer-requested handoffs.
- Production privacy controls: production audit-content redaction and configurable retention jobs.
- Liveness/readiness endpoints and production environment preflight.
- Security response headers and standalone Next.js build output.
- Container deployment artifacts with a persistent SQLite volume for a single-instance production/MVP deployment.
- Admin views for active policy/version history, human escalations, system events, and notification delivery state.
- Secure production support launch: short-lived signed customer/order launch, one-time JTI consumption, random session capability, and authorization on chat/session/voice/TTS routes.
- Customer CRM directory and deterministic demo route disabled in production host mode.
- Admin UI/API perimeter protected behind an identity-aware gateway-injected secret in production.

Explicit remaining enterprise blockers:
- Native customer/admin SSO, per-user RBAC, and user-level audit attribution beyond the current host-launch / identity-gateway boundary.
- Tenant isolation/RBAC for a multi-tenant SaaS deployment.
- Managed PostgreSQL and horizontally scalable background jobs.
- Real payment-provider refund execution/webhook reconciliation.
- Resend webhook delivery/bounce reconciliation.

Acceptance gate:
- Existing deterministic refund and voice paths remain unchanged in authority.
- Published policy changes affect runtime eligibility without a code deploy.
- An exact integration event replay is idempotent and a reused event ID with a different body is rejected.
- Refund completion queues exactly one notification even on idempotent refund replay.
- Sensitive fields are redacted from persisted agent-event metadata.
- Human escalation cannot switch customer/order ownership.
- Signed support launches expire, are single-use, and exchange into a bearer-protected support session.
- Production host mode cannot enumerate CRM customers/orders or expose evaluator demo routes.
- `npm run submission:check` remains green with the expanded test suite.
