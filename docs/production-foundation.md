# Jobform

This document describes the launch foundation around the support agent. The LLM orchestrates; deterministic server code authorizes and records financial actions.

## What this layer solves

### Business-system integration

A host commerce/CRM platform can synchronize a customer plus owned orders through `POST /api/integrations/business/context`.

Security properties:
- HMAC-SHA256 over the exact raw body plus timestamp and event ID.
- Five-minute timestamp tolerance.
- Constant-time signature comparison.
- Event IDs are idempotent; the same event/body is a safe replay.
- Reusing an event ID with a different body is rejected.
- Order ownership is validated before canonical upsert.
- Payload size is bounded.

This endpoint is deliberately a canonical ingestion boundary rather than scattering Shopify/ERP-specific code through tools. A business-specific connector can translate its source schema into this stable contract.


## Secure customer support launch

`SUPPORT_ENTRY=all` is the standalone product default: customers can look up an order in the portal, and a store backend can still request a signed launch. `SUPPORT_ENTRY=host` accepts only store launches. `SUPPORT_ENTRY=portal` accepts only portal lookup.

The public application never offers a customer directory or accepts browser-selected customer IDs. Portal lookup matches email plus a customer-owned order ID. A commerce backend can call HMAC-authenticated `POST /api/integrations/support/launch`; Jobform revalidates canonical ownership and returns a short-lived launch URL. The separate `SUPPORT_LAUNCH_SECRET` never needs to be shared with the store.

```text
authenticated commerce/CRM backend
        |
        | short-lived HMAC launch (customer + owned order + exp + jti)
        v
/support#launch=<token>
        |
        | one-time exchange; fragment removed from browser history
        v
random support-session bearer capability
        |
        +--> session read
        +--> support chat
        +--> Realtime transcription credential
        +--> persisted-message TTS
```

The launch JTI is persisted and may be consumed only once. Launch expiry is capped at 15 minutes; the helper defaults to five minutes. The resulting session token is random, only its SHA-256 hash is persisted, and the browser keeps the plaintext token only in React memory. A page refresh therefore intentionally requires a new host launch.

Local portal lookup remains available unless `SUPPORT_ENTRY=host`. Store launches still exchange a one-time fragment for an in-memory session credential.

## Admin perimeter

Staff sign in at `/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. `/admin/*` and `/api/admin/*` are protected by `src/proxy.ts`.

An identity-aware proxy may also inject `x-jobform-admin-gateway` matching `ADMIN_GATEWAY_TOKEN`. The gateway secret must never be returned to browser JavaScript.

The intended topology is:

```text
staff browser -> identity-aware proxy / company SSO -> inject admin gateway header -> Jobform admin routes
```

The gateway secret must never be returned to browser JavaScript. This makes the current single-tenant operations surface safe to place behind an existing company identity perimeter while leaving native multi-tenant identities, roles, and per-user audit attribution as explicit enterprise follow-up work.

## Dynamic refund policy

`refund_policy_versions` stores immutable-version configuration with `DRAFT`, `ACTIVE`, and `ARCHIVED` lifecycle states.

Publishing is atomic:
1. archive the previous active version,
2. activate the target draft,
3. record `published_at`.

Runtime paths that load the active policy:
- `get_refund_policy`,
- `validate_refund_request`,
- `execute_refund` transaction.

Every new refund row records `policy_version`, which allows later audit reconstruction.

The initial production implementation intentionally keeps the deterministic rule vocabulary fixed and versions its configuration, beginning with `refundWindowDays`. Introducing an arbitrary policy DSL should be treated as a separate compiler/validation project rather than allowing prose to become financial authority.

## Durable notification side effects

Refund execution writes a `notification_outbox` event in the same SQLite transaction as the refund ledger update.

This prevents email provider availability from controlling money state:

```text
refund transaction committed
        |
        +--> notification_outbox(PENDING)
                    |
              worker / scheduler
                    |
                  Resend
                    |
                SENT / retry / DEAD
```

Resend requests use the outbox `event_key` as the provider idempotency key. A replayed refund does not enqueue another email because both the refund idempotency key and notification event key are unique.

Recommended mode is `NOTIFICATION_DELIVERY_MODE=worker`. A protected endpoint, `POST /api/internal/notifications/drain`, can be invoked by a scheduler using `INTERNAL_JOB_TOKEN`.

## Operational observability

Agent events remain workflow observability. `operational_events` is a separate application/service log stream for integration, provider, and support-route failures.

Operational metadata is recursively redacted before console or database persistence. Agent-event metadata is also redacted before persistence, so tool outputs cannot accidentally retain obvious credentials or email fields in observability payloads.

`/admin/system` exposes:
- application operational events,
- notification-outbox state.

Production deployments should still export JSON stdout logs and OpenTelemetry-compatible metrics/traces to an external platform; SQLite operational events are the local audit/debug layer, not the long-term SIEM.

## Human escalation

`escalate_to_human` is an explicit agent tool. It can create one durable handoff per run for:
- high-risk accounts,
- policy exceptions,
- repeated tool failure,
- explicit customer request,
- other unsupported cases.

The tool revalidates authenticated customer/order ownership. High-risk and tool-failure handoffs receive high priority.

Escalations are visible under `/admin/escalations` and link back to their Agent Run.

## Privacy and retention

Production defaults avoid storing raw customer message content in `agent_runs` unless `AUDIT_STORE_CUSTOMER_CONTENT=true` is explicitly enabled. Expired one-time support-launch records are also removed by the retention job.

`npm run retention:apply` applies configured content-retention periods by:
- redacting old support-message content,
- redacting old agent input/final-output content,
- deleting old operational events.

Financial refund records are not deleted by this generic retention job because their required retention period is a business/legal decision.

## Deployment

The repository now includes:
- standalone Next.js output,
- `Dockerfile`,
- `docker-compose.production.yml`,
- `/api/health/live`,
- `/api/health/ready`,
- `npm run production:preflight`.

The included Compose topology is deliberately single-instance because SQLite is file-backed. Mount `/app/.data` to durable storage.

Before horizontal scaling, move persistence to managed PostgreSQL and move provider work to a durable queue/worker system.

## Remaining blockers before a generic enterprise launch

These cannot be truthfully solved without deployment/business-specific decisions:
- native customer/admin SSO, per-user RBAC, and user-level audit attribution (the current launch/gateway boundary integrates with an existing identity perimeter),
- multi-tenant tenant IDs, RBAC, and row-level authorization,
- a real payment-provider refund adapter and webhook reconciliation state machine,
- managed PostgreSQL + durable queue,
- Resend webhook verification/delivery/bounce reconciliation,
- organization-specific data classification, DPA/retention/residency rules,
- external alerting/SIEM and incident response,
- formal security/compliance verification.

The production foundation makes those additions additive rather than requiring the agent/refund core to be rewritten.
