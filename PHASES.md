# Delivery Phases

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

## Phase 3 — Customer chat API and real-time observability — NEXT

Goal: connect the polished product UI to the real Phase 2 backend.

Planned additions:
- Chat session/message persistence.
- Customer support API endpoint.
- Streaming customer response.
- Server-Sent Events (or equivalent) feed for admin agent events.
- Read APIs for agent runs, customers, policy, and refund ledger.
- Stable correlation/request IDs across chat, agent run, tools, decision, and refund.
- Existing `/support` and `/admin/*` screens switched from preview fixtures to backend state.

Acceptance gate:
- Customer message → model → tools → deterministic decision → customer response works end-to-end from the UI.
- Admin timeline reflects persisted tool start/failure/retry/success/policy/decision events in real time.
- No frontend refund decision logic exists.

## Phase 4 — Product integration hardening

Goal: finish the evaluated web product after the real APIs exist.

Recommended delegation:
- Antigravity: visual refinements and interaction polish only.
- Cursor: client/server integration review, TypeScript/build/runtime bug pass.
- Main engineering review: reject shortcuts that fabricate backend state or duplicate policy logic.

Acceptance gate:
- UI has zero hardcoded refund decisions.
- Admin logs are persisted backend events, not fake frontend reasoning.
- Loading, empty, error, retry, approval, and denial states are polished.

## Phase 5 — Voice bonus

Goal: add voice only after the text path is correct.

Planned additions:
- OpenAI Realtime browser voice connection via WebRTC.
- Server-created short-lived browser credential/session.
- Transcript routed through the same deterministic refund tools.
- Text fallback when realtime/microphone access fails.

Acceptance gate:
- Voice cannot bypass deterministic validation.
- Browser bundle contains no long-lived OpenAI secret.

## Phase 6 — Hardening, submission, and demo package

Includes:
- Full regression/build pass.
- Clean demo reset.
- Final README and architecture diagram.
- Public GitHub hygiene and deployment configuration.
- 7–10 minute walkthrough covering approve, deny, failure/retry, architecture, observability, and optional voice.
- Final senior-engineering review before submission.

Acceptance gate:
- Clean clone → install → reset/seed → verify → run follows README.
- Required demo paths are deterministic.
- No secrets, local databases, or generated runtime state are committed.
