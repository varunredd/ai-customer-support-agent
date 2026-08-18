# Phase 3 — Live Vertical Slice

Phase 3 connects the polished frontend to the persisted Phase 2 backend without moving refund authority into React or the LLM.

## End-to-end path

```text
/support
  |
  | POST /api/support/sessions
  v
support_sessions + support_messages
  |
  | POST /api/support/chat (SSE)
  v
OpenAI support agent
  |
  +--> CRM/order tools
  +--> deterministic policy engine
  +--> atomic refund execution
  |
  v
agent_runs + agent_events + refunds
  |
  +--> /api/admin/runs
  +--> /api/admin/runs/:id
  +--> /api/admin/runs/:id/events (SSE)
  +--> /api/admin/refunds
  v
/admin + /admin/runs + /admin/refunds
```

## Conversation persistence

Migration 2 adds `support_sessions` and `support_messages`.

A support session is bound to one customer and one customer-owned order. After the session is created, chat requests contain only the opaque session ID and message text. The server reloads the customer/order context from SQLite before invoking the agent.

Messages may correlate to an `agent_run` through `run_id`. The customer message is inserted before agent execution with a null run reference, then linked on the first persisted run event after the run row exists. This preserves the foreign-key boundary while keeping the message durable before the model call.

## Customer streaming

`POST /api/support/chat` returns Server-Sent Events:

- `run` — stable run/session correlation.
- `agent_event` — safe structured activity such as tool calls, retries, policy checks, decisions, and execution.
- `assistant_message` — persisted final customer-facing response.
- `done` — run completion.
- `error` — sanitized operational failure.

The model's private reasoning is never streamed or persisted.

The current OpenAI adapter is non-token-streaming; the HTTP response itself streams operational events in real time and then emits the final assistant message. Token streaming can be added later without changing refund authority or persistence contracts.

## Admin observability

`/admin/runs` now reads persisted run summaries and run details. While a selected run is `IN_PROGRESS`, it opens an EventSource to `/api/admin/runs/:id/events`. The server tails newly persisted `agent_events` by sequence and closes the stream after completion/failure.

This provides live operational observability without exposing chain-of-thought.

## Refund ledger

`/admin/refunds` reads only the persisted `refunds` table. Policy denials deliberately do not appear in this ledger because no money movement occurred; their audit trail remains in Agent Runs.

## Demo scenarios

- `/support?scenario=approve` — Maya Patel / Studio Headphones.
- `/support?scenario=deny` — Noah Williams / final-sale tee.
- `/support?scenario=retry` — Maya Patel with an optional injected `lookup_order` transient failure.

Retry injection is guarded by `ENABLE_DEMO_FAILURES=true` and is intended only for a local/demo environment.

## Security boundary

This take-home intentionally has no production authentication provider. Session creation is therefore a demo bootstrap endpoint and should not be treated as production identity proof. Once a session exists, the agent/tool layer still binds all tool access to the session's customer email and order context, so the model cannot switch identities.

A production version would place authentication/authorization in front of support-session creation and all `/api/admin/*` routes.
