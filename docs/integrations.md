# Business Platform Integration

Jobform can run as a standalone support portal, or a store can push canonical customer/order data and launch support for a signed-in shopper.

Portal customers never choose an arbitrary `customerId`. They prove the email and order ID pair. Store backends never send a customer ID from the browser either; they request a launch after authenticating the shopper.

## Store launch flow

```text
customer signs into commerce app
        |
        +--> host backend syncs canonical customer/order snapshot
        |        POST /api/integrations/business/context
        |
        +--> customer clicks Help / Refund
                 |
                 +--> host backend requests one-time support launch
                          POST /api/integrations/support/launch
                 |
                 +--> browser is redirected to returned launchUrl
                          /support#launch=...
                 |
                 +--> Jobform binds support session to that customer/order
```

The browser never chooses an arbitrary production `customerId` or `orderId`.

## Shared integration authentication

Both server-to-server integration endpoints use these headers:

```text
x-jobform-timestamp: <unix milliseconds>
x-jobform-event-id: <unique event ID>
x-jobform-signature: sha256=<HMAC-SHA256 hex>
x-jobform-source: <source name>
```

The signature input is the exact UTF-8 body:

```text
timestamp + "." + eventId + "." + rawBody
```

and the key is `BUSINESS_INTEGRATION_SECRET`.

Requests outside the replay window or with an invalid signature are rejected.

## 1. Synchronize customer/order context

Endpoint:

```text
POST /api/integrations/business/context
```

Example canonical body:

```json
{
  "customer": {
    "id": "cus_123",
    "name": "Maya Patel",
    "email": "maya@example.com",
    "accountStatus": "ACTIVE",
    "riskLevel": "LOW",
    "lifetimeOrders": 4,
    "lifetimeRefunds": 0,
    "createdAt": "2026-01-10T10:00:00Z"
  },
  "orders": [
    {
      "id": "ord_123",
      "customerId": "cus_123",
      "status": "DELIVERED",
      "currency": "USD",
      "subtotalCents": 8900,
      "shippingCents": 500,
      "taxCents": 0,
      "totalPaidCents": 9400,
      "refundedCents": 0,
      "placedAt": "2026-08-10T10:00:00Z",
      "deliveredAt": "2026-08-15T10:00:00Z",
      "items": [
        {
          "id": "item_123",
          "sku": "HEADPHONE-01",
          "name": "Studio Headphones",
          "quantity": 1,
          "unitPriceCents": 8900,
          "finalSale": false,
          "refundable": true
        }
      ]
    }
  ]
}
```

The adapter validates schema, order ownership, currency/status constraints, and event replay semantics before updating the canonical support model.

A Shopify, Magento, Salesforce, HubSpot, custom ERP, or order-management connector should translate its native records into this contract. Agent tools remain unchanged.

For local signing:

```bash
npm run integration:sign -- ./context.json
```

## 2. Request a customer support launch

After the canonical context exists, the authenticated host backend calls:

```text
POST /api/integrations/support/launch
```

with the same HMAC headers and:

```json
{
  "customerId": "cus_123",
  "orderId": "ord_123"
}
```

Jobform revalidates that the order belongs to the customer, then returns:

```json
{
  "launchUrl": "https://support.example.com/support#launch=<one-time-token>",
  "expiresInSeconds": 300,
  "customerId": "cus_123",
  "orderId": "ord_123"
}
```

Redirect the customer to `launchUrl`. Do not log the URL/token. It is short-lived and one-time at exchange.

The browser immediately removes the fragment from history and exchanges the launch for a random support-session credential. That credential is not stored in localStorage/sessionStorage and is required for later support/voice calls.

## Policy integration

Refund policies are versioned in `refund_policy_versions`. The current implementation deliberately keeps the rule vocabulary deterministic and allows versioned configuration (currently including the refund-window parameter). Policy prose is not allowed to become direct financial authority.

For businesses needing broader policy configurability, extend the typed rule schema/compiler and add regression/evaluation coverage before publishing new rule types. Do not evaluate arbitrary uploaded prose as the money-authorizing rule engine.

## External payment integration

The current repository records a deterministic local refund ledger. A real commerce launch must add a payment-provider adapter with provider idempotency, pending/succeeded/failed/unknown states, webhook verification, and reconciliation. This is intentionally separate from CRM integration so the agent and policy engine do not need to change when the payment provider changes.
