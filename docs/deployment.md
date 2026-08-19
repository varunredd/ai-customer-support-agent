# Deployment

## Local product

```bash
npm ci
cp .env.example .env.local
npm run db:bootstrap
npm run ci:check
npm run dev
```

Staff sign in at `/login`. Customers open `/support` with the email and order ID on the account.

## Render + persistent disk

Jobform keeps SQLite on disk, so the first public host is a **Render Web Service** with a persistent disk. Do not use Vercel until the database is Postgres.

1. Push this branch to GitHub.
2. In Render: **New → Blueprint** and select the repo, or **New → Web Service** with Docker runtime.
3. Attach a 1 GB disk at `/app/.data` (requires a paid Starter plan; free instances cannot keep SQLite).
4. Set the environment variables below in the Render dashboard. Do not put production secrets in `.env.local`.
5. After the first deploy, set `APP_BASE_URL` to `https://<your-service>.onrender.com` (or your domain) and redeploy if launch URLs still point at localhost.

`DATABASE_PATH` must be `/app/.data/jobform-support.sqlite` so it lives on the disk.

The first boot migrates the schema and, when `SEED_SAMPLE_CATALOG=true`, loads the sample catalog so `/support` works immediately (`maya@example.com` / `ord_8901`).

Health check path: `/api/health/live`.

## Single-instance container

The repository emits Next.js standalone output and includes a non-root runtime image.

1. Create `.env.production.local` from `.env.example`.
2. Configure at minimum:
   - `OPENAI_API_KEY`
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+)
   - `ADMIN_SESSION_SECRET` (32+)
   - `BUSINESS_INTEGRATION_SECRET` (32+)
   - `ADMIN_CONTROL_TOKEN` (24+)
   - `INTERNAL_JOB_TOKEN` (24+)
   - `SUPPORT_LAUNCH_SECRET` (32+)
   - `SUPPORT_ENTRY=all` (or `portal` / `host`)
   - `APP_BASE_URL` as the public origin
3. If email is enabled, configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
4. Run validation:

```bash
npm run production:preflight
npm run ci:check
```

5. Launch the container:

```bash
docker compose -f docker-compose.production.yml up --build -d
```

The Compose file mounts `/app/.data` to a named volume and points `DATABASE_PATH` at that volume.

### Health endpoints

- `/api/health/live` confirms the process is serving HTTP.
- `/api/health/ready` confirms the database is queryable, schema is current, and required live-agent configuration exists.

Use readiness rather than liveness for load-balancer traffic admission.

## Customer and admin access

Default `SUPPORT_ENTRY=all` allows:

- portal lookup with email + order ID
- store-launched support through `POST /api/integrations/support/launch`

Set `SUPPORT_ENTRY=host` to accept only store launches. Set `SUPPORT_ENTRY=portal` to disable store launches.

Staff sign in at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Optionally place `/admin` behind an identity-aware proxy that injects:

```text
x-jobform-admin-gateway: <ADMIN_GATEWAY_TOKEN>
```

The gateway token is server-to-server configuration and must never be embedded in frontend code.

For store-launch testing:

```bash
npm run support:launch-token -- cus_001 ord_8901
```

Open the generated fragment URL once. Refreshing a launched session requires a new launch because the session credential is held only in browser memory.

## Background notification delivery

Recommended production mode:

```text
NOTIFICATION_DELIVERY_MODE=worker
```

Schedule either:

```bash
npm run notifications:drain
```

or an authenticated POST to:

```text
/api/internal/notifications/drain
```

with:

```text
Authorization: Bearer <INTERNAL_JOB_TOKEN>
```

Refund state is already committed before notification processing begins, so a mail outage never changes the refund outcome.

## Privacy maintenance

Schedule:

```bash
npm run retention:apply
```

at an interval appropriate for the configured retention window.

## Important SQLite constraint

The included container deployment is intentionally **single application instance**. SQLite is a reliable embedded database for this bounded topology, but the current repository is not a horizontal multi-replica database architecture.

Before scaling application replicas or promising high availability:
- migrate persistence to managed PostgreSQL,
- use a dedicated migration mechanism appropriate to PostgreSQL,
- move notification/payment jobs to a durable queue,
- add external observability and alerts,
- test backups and restore procedures.

## Security boundary

The repository adds secure headers, server-only secrets, signed integration ingestion, one-time customer support launches, bearer-protected support sessions, staff sign-in, an optional admin-gateway perimeter, protected internal/control APIs, audit redaction, and health/preflight checks. Native multi-tenant SSO/RBAC remains a later product layer.

