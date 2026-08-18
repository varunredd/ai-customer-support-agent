# Architecture — Phase 3

## Deployment boundary

Keep one Next.js App Router application for the take-home. Separate concerns internally rather than creating premature microservices.

## Module boundaries

- `src/domain/refunds` — domain types, machine-checkable policy, refund execution contracts.
- `src/services/refund-eligibility.service.ts` — deterministic approval/denial and amount calculation.
- `src/services/refund-execution.service.ts` — atomic money-safety boundary and idempotency.
- `src/db` — SQLite migration/database/seed lifecycle.
- `src/repositories` — SQLite customer/order, support-session, agent-run, and admin read models.
- `src/tools/agent` — strict LLM tool schemas, validation, authorization, tool implementations.
- `src/services/agent` — model-independent orchestration, retry policy, prompt, loop guard.
- `src/integrations/openai` — narrow Responses API adapter.
- `src/app/api` — HTTP/SSE transport over the same server-side services.
- `src/app` / `src/components` — presentation only.

## Authority model

```text
LLM
  can: choose tools, ask questions, explain outcomes
  cannot: authorize money, set authoritative timestamps, choose auth identity,
          or control execution idempotency

Deterministic refund engine
  owns: rule evaluation + refund amount

Refund execution service
  owns: final in-transaction revalidation + idempotent ledger write
```

This deliberately treats model output as untrusted orchestration input.

## Agent loop

1. Persist `agent_run` and `REQUEST_RECEIVED`.
2. Send customer message + authenticated context to the model.
3. Receive zero or more function calls.
4. Validate JSON/tool arguments against application-side validators.
5. Enforce authenticated-customer authorization.
6. Execute the selected tool with timeout/retry bounds.
7. Persist structured tool events.
8. Return `function_call_output` to the model.
9. Continue until customer-facing text is returned or max turns are exceeded.
10. Persist final run status.

All model output items required for the Responses tool loop are replayed to the model, but hidden reasoning is never persisted to `agent_events` and is never exposed as an admin feature.

## Refund execution transaction

`execute_refund` does not trust the preceding model/tool sequence.

Inside one immediate SQLite transaction it:

1. Checks the server-generated idempotency key.
2. Returns the exact persisted result on a true replay.
3. Rejects key reuse for a different money intent.
4. Reloads current customer/order state.
5. Sums completed item-level refund quantity.
6. Re-runs all deterministic policy rules.
7. Writes the completed refund ledger only when approved.
8. Updates order refunded balance and customer refund count.

This protects against double execution, partial-item over-refunds, stale prechecks, and a model attempting to skip validation.

## Persistence choice

SQLite is sufficient for a self-contained take-home and keeps clone-to-run setup small. `better-sqlite3` is isolated behind database/repository/service boundaries so persistence can later move to Postgres without moving refund policy into the UI or LLM layer.

## Phase 3 transport boundary

Phase 3 adds support-session/message persistence plus HTTP/SSE adapters. `/support` streams safe agent events and the final persisted assistant message. `/admin/runs` tails persisted events by sequence while a run is active. `/admin/refunds` reads only completed refund ledger rows.

The transport layer never evaluates refund policy. It only validates request shape, resolves server-owned support context, invokes the existing agent/service layer, and serializes persisted results.
