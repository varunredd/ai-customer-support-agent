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
