# Phase 4 — Product Integration Hardening

Phase 4 removes the remaining demo-only seams from the Phase 3 vertical slice without changing refund authority, agent orchestration, or persistence boundaries.

## Normal support entry

`/support` no longer silently defaults to the Maya approval fixture. With no query parameters it now loads customer options from SQLite, lets the operator choose a CRM customer, then loads only orders owned by that customer before creating a support session.

```text
/support
  |
  +--> GET /api/support/context
  |       -> CRM customer options
  |
  +--> GET /api/support/context?customerId=...
  |       -> customer-owned order options
  |
  +--> POST /api/support/sessions
          -> immutable customer/order session context
```

The browser never evaluates refund policy while selecting a session. Selection only establishes the server-owned support context.

## Deterministic evaluator shortcuts remain

The hiring demo still benefits from predictable one-click paths:

- `/support?scenario=approve`
- `/support?scenario=deny`
- `/support?scenario=retry`
- `/demo`

These are explicitly demo bootstraps, not the normal product entry path. Scenario IDs live in `src/config/demo-scenarios.ts` instead of being embedded in the main support component.

The retry shortcut still requires `ENABLE_DEMO_FAILURES=true`; failure injection is off by default.

## Customer-visible outcomes

The support UI now renders an outcome card only after receiving structured backend events.

- `DECISION: APPROVE` -> eligibility presentation using persisted `refundAmountCents`.
- `DECISION: DENY` -> denial presentation using persisted `denialReasons`.
- successful `REFUND_EXECUTION` -> completed refund presentation using the persisted refund record.

There is no policy condition, return-window calculation, final-sale rule, or refund amount calculation in React.

## Failure safety

Customer-facing streaming failures are sanitized before they leave the support API. Provider/network details remain available through persisted admin run events, while the customer receives a stable operational message.

The UI does not automatically replay a failed money-related request. When a run ID exists, the error state points the reviewer to that persisted run before they try again.

## Admin integration polish

Agent Runs now:

- keep the selected run in the URL (`?run=...`),
- show persisted APPROVE/DENY outcome summaries,
- show approved amounts from the persisted decision event,
- refresh safely,
- reconnect the live event stream after a transient EventSource failure,
- retain the persisted run as source of truth after reconnect.

The Refunds ledger links completed runtime refunds back to their originating Agent Run. The seeded historical partial refund remains visibly distinct because it has no run ID.

## Removed preview state

The old hardcoded `agentRunsPreview` fixture has been removed from runtime state. The compatibility module remains empty so incremental overlays do not need a destructive-delete mechanism.

## Phase boundary

Phase 4 does not add:

- new refund rules,
- new LLM authority,
- new persistence architecture,
- production authentication,
- voice.

Voice remains Phase 5. Submission/deployment/demo packaging remains Phase 6.
