# Phase 2 Engineering Notes

## Tables

### `customers`
Seeded CRM profile state used by authorization and refund rules.

### `orders` / `order_items`
Current order state and refundable item facts.

### `agent_runs`
One durable record per support-agent execution.

### `agent_events`
Ordered structured observability events. Examples include:

- `MODEL_REQUEST`
- `MODEL_RESPONSE`
- `MODEL_FAILED`
- `MODEL_RETRY`
- `TOOL_STARTED`
- `TOOL_FAILED`
- `TOOL_RETRY`
- `TOOL_SUCCEEDED`
- `POLICY_CHECK`
- `DECISION`
- `REFUND_EXECUTION`

These events are operational evidence, not model chain-of-thought.

### `refunds`
Completed refund ledger. Each row has:

- unique idempotency key,
- request fingerprint,
- customer/order/item,
- quantity,
- amount,
- originating agent run,
- exact deterministic evaluation JSON used for the successful execution.

Persisting the original evaluation makes idempotent replay stable even when CRM/order state changes later.

## Tool set

### `lookup_customer_by_email`
Looks up only the customer bound to the authenticated support session when one is present.

### `lookup_order`
Requires order ownership and cannot switch to a different authenticated customer.

### `get_refund_policy`
Returns the authoritative machine-readable policy.

### `validate_refund_request`
Runs the deterministic evaluator. The LLM does not provide the authoritative request timestamp.

### `execute_refund`
Re-runs deterministic eligibility inside the transaction and uses a server-generated idempotency key. The model cannot create or change the key.

## Demo scenarios

```bash
npm run db:reset
npm run demo:agent -- approve
npm run demo:agent -- deny
npm run demo:agent -- retry
```

`retry` intentionally injects a one-time transient `lookup_order` failure so the persisted timeline contains failure → retry → success for the walkthrough.

## Phase 3 handoff

The next phase should expose this backend through APIs rather than letting React import database/services directly. The existing UI view models remain temporary until those API contracts are in place.
