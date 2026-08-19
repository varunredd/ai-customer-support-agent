# Security and Data-Handling Posture

This repository contains a production-oriented foundation for a policy-grounded customer-support agent. It is **not** a claim of SOC 2, PCI DSS, HIPAA, GDPR, or other regulatory certification. Those outcomes require organization-specific controls, contracts, operating procedures, evidence, and deployment decisions in addition to application code.

## Security boundaries implemented in code

- **Financial authority:** the LLM cannot write the refund ledger or choose the authoritative amount/idempotency key. Refund execution revalidates deterministic policy inside the database transaction.
- **Customer identity:** support starts from a portal email/order lookup or a signed, short-lived, single-use store launch. The browser exchanges it for a random support-session capability; only its SHA-256 hash is persisted.
- **Session authorization:** session reads, support chat, Realtime credential minting, and TTS all re-check the support-session capability in host mode.
- **Admin perimeter:** staff sign-in cookies protect admin pages/APIs. An identity-aware gateway header remains an optional extra perimeter.
- **Business integration:** CRM/order synchronization and host-launch requests use HMAC-SHA256 over timestamp + event ID + exact raw body, with a bounded replay window.
- **Internal jobs/control:** scheduler and policy-mutation endpoints require server-side control tokens.
- **Secrets:** credentials are server-only environment variables. Do not use `NEXT_PUBLIC_*` for OpenAI, Resend, gateway, HMAC, or worker credentials.
- **Provider side effects:** refund email is dispatched from a durable outbox after the financial transaction has committed.
- **Observability:** workflow events and operational events are separated. Sensitive metadata is redacted before persistence.

## Data classification and minimization

Treat the following as personal or confidential data:

- customer identity/contact fields,
- support-message content,
- order history,
- refund history,
- escalation summaries,
- provider identifiers and operational metadata that can be linked back to a customer.

The agent should receive only the customer/order/policy fields required for the active workflow. Payment credentials, passwords, cookies, API keys, and unrelated customer records must never be sent to the model or written to logs.

Production defaults redact raw customer content from `agent_runs`. `npm run retention:apply` redacts/deletes eligible support, agent, operational, notification, and expired launch records according to configured retention windows. Financial record retention must be defined with the business/legal owner rather than removed by the generic cleanup job.

## Logging and incident response

Application failures emit structured JSON logs and optional persisted `operational_events`. Agent workflow events remain a separate audit stream. Production deployments should export logs, metrics, traces, and alerts to an external observability/SIEM platform and define an incident-response/on-call procedure.

Never place credentials, raw authorization headers, payment secrets, or full sensitive customer payloads in operational metadata.

## Production deployment expectations

Before public launch:

1. Run `npm run production:preflight` and `npm run production:check`.
2. Use HTTPS and a real secret manager.
3. Put admin traffic behind an identity-aware gateway/SSO perimeter.
4. Keep `SUPPORT_ENTRY` set to `all`, `portal`, or `host` as intended for the deployment.
5. Configure backups and perform restore tests.
6. Configure external rate limiting/WAF, monitoring, alerts, and incident ownership.
7. Replace SQLite with managed PostgreSQL and a durable job queue before horizontal scaling/high availability.
8. Integrate a real payment provider with asynchronous status/webhook reconciliation before representing local ledger completion as external settlement.
9. Complete organization-specific privacy/compliance review, vendor/DPA review, data-retention approval, and security testing.

## Reporting a vulnerability

Do not include customer data, secrets, or exploit payloads in public GitHub issues. Use the repository owner's private security-reporting channel if one is configured for the deployed project.
