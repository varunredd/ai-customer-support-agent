# Phase 6 — Submission Hardening

Phase 6 adds no product feature. It turns the certified Phase 5 vertical slice into a reproducible public-repository submission.

## Delivered

- Final public-facing README and architecture documentation.
- Corrected voice documentation: `gpt-4o-mini-transcribe` is the certified default for the one-turn server-VAD microphone flow.
- Deterministic `npm run demo:reset` + fixture certification.
- Git-tracked-file submission audit.
- GitHub Actions verification workflow.
- 7–10 minute Loom walkthrough plan.
- Explicit SQLite hosting/persistence note.
- Final scope/security checklist.

## Clean-clone evaluator path

```bash
npm ci
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
# add OPENAI_API_KEY for live model/voice requests
npm run demo:reset
npm run submission:check
npm run dev
```

`submission:check` runs the source audit, demo-state certification, TypeScript, automated tests, and production build.

## Demo-reset contract

After `npm run demo:reset`:

- customer count = 15,
- order count = 6,
- order-item count = 6,
- refund count = 1 (the seeded historical partial refund),
- agent runs/events = 0,
- support sessions/messages = 0,
- `ord_demo_approve` refunded balance = 0,
- `ord_demo_final_sale` refunded balance = 0,
- `ord_demo_partial` refunded balance = $30.00.

This protects the recorded approval demo from being denied because an earlier local run already refunded Maya's headphones.

## GitHub hygiene

The repository intentionally excludes:

- `.env` / `.env.local` / environment secrets,
- `.data/` and SQLite/WAL files,
- `node_modules`,
- `.next` and build output,
- logs/coverage,
- generated ZIP overlays/source exports.

`npm run submission:audit` additionally inspects the Git index so an accidentally force-added ignored file is still detected before submission.

## CI

`.github/workflows/ci.yml` performs:

1. `npm ci`,
2. `npm run submission:audit`,
3. `npm run demo:reset`,
4. `npm run verify`.

The CI gate does not call the live model or voice APIs. Live behavior remains part of the manual Loom certification.

## Final manual certification checklist

Before publishing the repository/video:

- [ ] Working tree is clean.
- [ ] `npm run demo:reset` passes.
- [ ] `npm run submission:check` passes.
- [ ] `/support` normal customer/order selection works.
- [ ] Approval demo returns the expected $89.00 item refund.
- [ ] Final-sale denial creates no refund ledger row.
- [ ] Failure/retry run shows persisted failed/retry/success events.
- [ ] `/admin/runs` opens the selected run and shows structured events only.
- [ ] `/admin/refunds` links the executed refund back to its Agent Run.
- [ ] Voice microphone uses the same support-agent path.
- [ ] TTS plays a persisted AGENT response; text remains available.
- [ ] `ENABLE_DEMO_FAILURES` is returned to `false` after the retry recording.
- [ ] `.env.local`, `.data/`, DB files, and video files are not staged.
- [ ] README public-repo instructions match the actual commands.
- [ ] Public GitHub default branch contains the final certified submission commit.

## Submission artifact

The hiring submission should contain only:

1. public GitHub repository link,
2. Loom or Google Drive walkthrough link.

The video should demonstrate approval, denial, failure/retry observability, architecture/tool boundaries, and voice if time permits. See `docs/loom-walkthrough.md`.
