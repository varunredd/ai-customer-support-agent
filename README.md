# Jobform

Jobform is an AI customer-support product for refund requests.

Customers open support from the portal or from a connected store. The agent investigates the order, then a **deterministic policy engine** decides eligibility, amount, and ledger writes. The model cannot approve a refund the policy would deny.

## Product routes

- `/` — product home
- `/support` — customer portal (email + order ID)
- `/login` — staff sign-in
- `/admin` — operations: runs, customers, refunds, policy, escalations, system
- `/privacy` and `/terms`
- `/api/health/live` and `/api/health/ready`

Store backends can also launch support with a signed, one-time URL:

```text
POST /api/integrations/business/context
POST /api/integrations/support/launch
```

## Authority model

The model may:

- decide which approved tool to call
- ask clarifying questions
- explain a policy result

The model may not:

- write the refund ledger
- choose the refund amount
- mint its own idempotency key
- switch to a different customer or order after the session starts

Refund completion in Jobform is a ledger record. Connect a payment provider when you want settlement on the original payment method.

## Local launch

```bash
npm ci
cp .env.example .env.local
# set OPENAI_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, and the secrets listed below
npm run db:bootstrap
npm run dev
```

Open `/`, then `/support` with a catalog order such as `maya@example.com` / `ord_8901`, or `/login` for the staff console.

## Environment

Required for a public workspace:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI credential |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Staff console sign-in |
| `ADMIN_SESSION_SECRET` | Signs staff cookies (32+) |
| `ADMIN_CONTROL_TOKEN` | Protects policy publish APIs (24+) |
| `BUSINESS_INTEGRATION_SECRET` | HMAC key shared with a store backend (32+) |
| `SUPPORT_LAUNCH_SECRET` | Signs store launch tokens; Jobform-only (32+) |
| `INTERNAL_JOB_TOKEN` | Notification drain and retention jobs (24+) |
| `APP_BASE_URL` | Public origin for launch URLs |

Useful defaults:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SUPPORT_ENTRY` | `portal`, `host`, or `all` | `all` |
| `SEED_SAMPLE_CATALOG` | Load sample customers/orders on empty local DBs | `true` locally |
| `OPENAI_MODEL` | Responses API model | `gpt-4o-mini` |
| `DATABASE_PATH` | SQLite file | `.data/jobform-support.sqlite` |
| `NOTIFICATION_DELIVERY_MODE` | `worker` | `worker` |

Never set OpenAI, Resend, admin, or integration secrets as `NEXT_PUBLIC_*`.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run db:bootstrap
npm run catalog:check
npm run source:audit
npm run ci:check
npm run production:preflight
npm run notifications:drain
npm run retention:apply
```

## Deployment

Single-instance container:

```bash
docker compose -f docker-compose.production.yml up --build -d
```

SQLite is the included database. Run one application instance and mount `/app/.data`. Move to PostgreSQL before horizontal scale.

Staff can sign in at `/login`. Optionally put `/admin` behind an identity-aware proxy that injects `x-jobform-admin-gateway`.

See `docs/deployment.md`, `docs/integrations.md`, and `SECURITY.md`.
