# Delivery Phases

## Phase 1 — Domain foundation and policy engine

Goal: create a runnable Next.js baseline where refund decisions are deterministic and testable before any LLM is introduced.

Includes:
- Next.js App Router shell.
- 15 CRM customer fixtures.
- Order fixtures for approval and multiple denial scenarios.
- Strict refund policy document + machine-readable policy.
- Repository interfaces.
- Refund eligibility service.
- Tool-facing functions.
- Core tests and architecture notes.

Acceptance gate:
- Strict TypeScript passes for domain modules.
- Standard demo case approves for the expected amount.
- Final-sale demo case denies with an explicit rule code.

## Phase 2 — Persistence, LLM agent loop, execution safety

Goal: make the backend genuinely agentic without giving the model authority over money rules.

Planned additions:
- Mature SQLite persistence adapter and seed/migration flow.
- `customers`, `orders`, `order_items`, `refunds`, `agent_runs`, and `agent_events` tables.
- OpenAI Responses API raw function-calling loop.
- Tools: customer lookup, order lookup, refund-policy retrieval, deterministic eligibility validation, idempotent refund execution.
- Maximum-step protection, malformed-tool-argument handling, tool retry policy, and structured errors.
- Persisted agent event/audit trail suitable for the admin dashboard.
- Idempotency key on refund execution so retrying the agent cannot double-refund.
- API-level and orchestration tests.

Acceptance gate:
- An LLM must call tools rather than inventing CRM/policy facts.
- A successful refund produces exactly one refund ledger record under retries.
- A denied refund can never invoke successful execution.

## Phase 3 — Customer chat API and real-time observability

Goal: expose the agent as a product vertical slice.

Planned additions:
- Chat session/message persistence.
- Streaming customer response endpoint.
- Server-Sent Events (or equivalent) feed for admin agent events.
- Session correlation IDs across chat, agent run, tool call, decision, and refund.
- Failure/retry events designed for the assignment walkthrough.
- API contract documentation for frontend work.

Acceptance gate:
- Customer message -> agent -> tools -> decision -> response works end-to-end.
- Admin event stream reflects tool start/success/failure/retry/decision in real time.

## Phase 4 — Product UI integration

Goal: finish the evaluated UI while keeping frontend implementation separable from backend correctness.

Recommended delegation:
- Antigravity: customer chat page and admin dashboard visual implementation from provided API contracts.
- Cursor: integrate components against the real APIs, fix type/build/runtime issues, review client/server boundaries.
- Main engineering review: reject any frontend shortcut that bypasses backend policy or mocks reasoning logs.

Planned product surfaces:
- Customer chat with identity/order context.
- Admin dashboard with agent runs, tool calls, rule checks, failures, retries, final decisions, and refund status.
- Demo fixture shortcuts only in development mode.

Acceptance gate:
- UI has zero hardcoded refund decisions.
- Admin logs come from persisted backend events, not fabricated frontend steps.

## Phase 5 — Voice bonus

Goal: add voice only after the text path is correct.

Planned additions:
- OpenAI Realtime browser voice connection via WebRTC.
- Server-minted short-lived session/client credential; long-lived API key never exposed to browser.
- Voice transcript routed into the same refund business tools/decision path.
- Graceful fallback to text if microphone or realtime connection fails.

Acceptance gate:
- Voice cannot bypass deterministic refund validation.
- Browser bundle contains no server API secret.

## Phase 6 — Hardening, submission, and demo package

Goal: optimize for the actual hiring evaluation.

Includes:
- Full regression and build pass.
- Edge/failure cases and seeded demo reset.
- README with architecture diagram, setup, env, demo accounts/cases, and tradeoffs.
- GitHub hygiene and deployment configuration.
- 7–10 minute walkthrough script covering live approve, live deny, architecture, orchestration, logs/retries, and optional voice.
- Final senior-engineering review with Cursor/Antigravity feedback incorporated only after verification.

Acceptance gate:
- Clean clone -> install -> seed -> run works from README.
- Both required demo paths are deterministic.
- No secret or local database is committed.
