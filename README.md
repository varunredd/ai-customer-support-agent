# Jobform AI Customer Support Agent

A policy-grounded e-commerce support agent built for the Jobform Automator Next.js take-home assignment.

The application deliberately separates **conversation/orchestration** from **money decisions**: the LLM can decide which tool to call, but only deterministic server-side code can approve, deny, calculate, or persist a refund.

## Current status — Phase 3

Implemented:

- Next.js 16 App Router application and polished support/admin UI shell.
- 15 deterministic CRM customer profiles and six demo orders.
- 10-rule machine-checkable refund policy.
- Deterministic refund eligibility service.
- Versioned SQLite migrations and idempotent fixture seeding.
- SQLite repositories for customers and orders.
- Persisted `agent_runs`, `agent_events`, and completed refund ledger.
- OpenAI Responses API raw function-calling loop.
- Strict function schemas and structured tool results.
- Authenticated-customer binding at the tool boundary.
- Server-owned refund request timestamp and server-generated idempotency key.
- Tool/model retries, timeouts, abort signals, malformed-argument handling, and max-turn protection.
- Atomic refund execution that re-runs policy validation inside the database transaction.
- Exact idempotent replay from the persisted original refund evaluation.
- Structured observability only; hidden chain-of-thought is never persisted or displayed.
- Tests for approval, denial, execution bypass attempts, identity switching, idempotency, partial refunds, retries, malformed calls, and loop guards.

The main evaluated vertical slice is now live: `/support` persists sessions/messages and streams structured agent activity, while `/admin`, `/admin/runs`, `/admin/customers`, and `/admin/refunds` read persisted backend state. The policy screen remains a read-only view of the authoritative machine-checkable policy in code.

## Architecture

```text
Customer message
      |
      v
Support Agent Orchestrator  -----> OpenAI Responses API
      |                               |
      |<------ function calls --------|
      |
      +--> authenticated CRM tools
      +--> order lookup
      +--> refund policy retrieval
      +--> deterministic validation
      +--> atomic/idempotent execution
                     |
                     v
                  SQLite
          agent runs / events / refunds
```

### Money-safety boundary

The language model cannot directly approve money movement. `execute_refund` always re-runs the deterministic policy engine inside an immediate SQLite transaction before writing a refund. A model that skips `validate_refund_request` therefore still cannot successfully refund an ineligible order.

The execution boundary also owns idempotency. The model does not invent idempotency keys, and request timestamps used for return-window calculations come from application context rather than tool arguments.

## Local setup

Requirements:

- Node.js 20.9+
- npm
- OpenAI API key only for the live agent demo

Install dependencies:

```bash
npm install
```

Create local environment configuration:

macOS/Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Set your server-only API key in `.env.local`:

```text
OPENAI_API_KEY=your_key_here
```

Never prefix the key with `NEXT_PUBLIC_`.

Create a fresh local database and seed deterministic demo data:

```bash
npm run db:reset
```

Run the full acceptance gate:

```bash
npm run verify
```

Start the web application:

```bash
npm run dev
```

Open the local URL printed by Next.js.

## Live agent demos

These commands execute the real OpenAI tool loop and print the persisted run/event trail.

Standard approval:

```bash
npm run demo:agent -- approve
```

Final-sale denial:

```bash
npm run demo:agent -- deny
```

Injected transient tool failure followed by retry:

```bash
npm run demo:agent -- retry
```

The retry injection exists only in the explicit demo/test path; it is not activated by production environment state.

## Reserved demo fixtures

- Approval: Maya Patel — `cus_001` — `ord_demo_approve` — `item_001` — Studio Headphones — item refund `$89.00`.
- Final-sale denial: Noah Williams — `cus_002` — `ord_demo_final_sale` — `item_002`.
- Expired window: Ava Chen — `ord_demo_expired`.
- Used-condition denial: Ethan Brown — `ord_demo_used`.
- High-risk denial: Liam Johnson — `ord_demo_high_risk`.
- Partial-refund quantity protection: Mia Anderson — `ord_demo_partial`.

Shipping is intentionally excluded from automated refund amount by policy.

## Useful commands

```bash
npm run db:migrate
npm run db:seed
npm run db:reset
npm run typecheck
npm test
npm run build
npm run verify
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI credential | required for live agent |
| `OPENAI_MODEL` | Responses API model | `gpt-4o-mini` |
| `DATABASE_PATH` | Local SQLite file | `.data/jobform-support.sqlite` |
| `AGENT_MAX_TURNS` | Model-loop safety bound | `10` |
| `AGENT_TOOL_MAX_ATTEMPTS` | Automatic tool attempts | `3` |
| `AGENT_TOOL_TIMEOUT_MS` | Per-tool timeout | `5000` |

The `.data` directory, SQLite files, `.env*` secrets, build output, and `node_modules` are excluded from source exports.

## Phase 3 web demo

After `npm run db:reset` and `npm run dev`:

- `/support?scenario=approve` — live approval flow.
- `/support?scenario=deny` — live final-sale denial flow.
- `/admin/runs` — persisted/live structured agent timeline.
- `/admin/refunds` — persisted money-movement ledger.
- `/demo` — links to approval, denial, and retry walkthroughs.

For the local failure/retry walkthrough, set `ENABLE_DEMO_FAILURES=true` in `.env.local` before opening `/support?scenario=retry`.

## Next — Phase 4

Phase 4 hardens the integrated product: integration review, UX edge states, public-demo safety boundaries, and final bug fixing before the optional voice phase.

See `docs/architecture.md`, `docs/phase-2.md`, `docs/phase-3.md`, and `PHASES.md` for implementation details and phase boundaries.
