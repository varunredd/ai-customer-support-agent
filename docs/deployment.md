# Deployment Notes

A hosted URL is not required by the assignment. The supported evaluator path is local because the application intentionally uses SQLite for a self-contained clone-to-run experience.

## If hosting the current build

The runtime needs:

- Node.js 20.9+,
- a server-side `OPENAI_API_KEY`,
- a writable persistent filesystem/volume for `DATABASE_PATH`,
- WebRTC/microphone access over a secure browser context for voice.

Do not rely on an ephemeral serverless filesystem for the SQLite database if you expect refund/session state to persist between instances or restarts.

A production evolution would normally replace the SQLite repository implementation with a network database while retaining the same domain/service boundaries.

## Environment

Use the variables documented in `.env.example`. Never expose the long-lived OpenAI API key through a `NEXT_PUBLIC_*` variable.

The optional failure-injection flag must remain disabled outside the local evaluator retry scenario:

```text
ENABLE_DEMO_FAILURES=false
```

## Health/readiness

For the hiring assignment, the reproducibility gate is:

```bash
npm ci
npm run demo:reset
npm run submission:check
npm run dev
```

A production deployment would additionally require authentication, durable secrets management, operational monitoring, backups, and production database migration; these are intentionally outside this take-home scope.
