# Loom Walkthrough — 7–10 Minutes

Target length: **8–9 minutes**. Keep the recording product-first; explain architecture only after the reviewer has seen the working path.

## Before recording

Run:

```bash
npm run demo:reset
npm run submission:check
npm run dev
```

For the retry scenario only, set `ENABLE_DEMO_FAILURES=true` and restart the dev server before that segment. Turn it back off after recording.

Open these tabs in advance:

1. `/demo`
2. `/support?scenario=approve`
3. `/admin/runs`
4. `/admin/refunds`
5. code editor at `src/services/refund-execution.service.ts`
6. code editor at the agent/tool registry

Do not show `.env.local` or the API key on screen.

## 0:00–0:40 — What the product is

Say, in your own words:

> This is an AI customer-support agent for e-commerce refunds. The model handles conversation and decides which backend tools to call, but it never has authority to move money. Eligibility, amount, idempotency, and the refund ledger are deterministic server-side responsibilities.

Briefly show `/demo` and mention the normal `/support` flow also lets you pick a real seeded CRM customer and one of that customer's orders.

## 0:40–2:15 — Standard refund approval

Open `/support?scenario=approve`.

Send:

> I want to return my Studio Headphones. I changed my mind, they are unopened, and I want to return quantity 1.

While it runs, point out the safe activity indicators rather than describing hidden reasoning.

Expected result:

- approval,
- `$89.00` item refund,
- shipping excluded,
- completed refund card.

Click **View run**.

## 2:15–3:25 — Observability/tool orchestration

In `/admin/runs`, show the persisted structured timeline:

- request received,
- tool starts/completions,
- policy check,
- decision,
- refund execution,
- run completion.

Explain:

> These are operational events, not chain-of-thought. They are persisted backend events so an admin can audit what happened without exposing hidden model reasoning.

Expand one tool call and show sanitized input/output.

## 3:25–4:25 — Refund ledger + financial boundary

Open `/admin/refunds` and show the new Maya refund plus **Inspect** back to the same run.

Then switch to `refund-execution.service.ts`.

Explain only the important pieces:

> Even if the model tries to skip the earlier validation tool, execution reloads current state and re-runs the deterministic policy inside the SQLite transaction. The server also owns the idempotency key, so retries cannot silently double-refund the order.

Do not spend time reading implementation line by line.

## 4:25–5:35 — Policy denial

Open `/support?scenario=deny`.

Send:

> I want to return the Limited Edition Tee. I changed my mind, it is unopened, and I want to return quantity 1.

Show the denial card and the final-sale reason.

Then briefly show `/admin/refunds` and explain that the denial created no money-movement row.

## 5:35–6:40 — Failure → retry → success

With `ENABLE_DEMO_FAILURES=true`, open `/support?scenario=retry`.

Use the same headphones request after resetting demo state if needed.

Open the run and show:

```text
TOOL_STARTED
TOOL_FAILED
TOOL_RETRY
TOOL_SUCCEEDED
```

Explain:

> The retry is bounded and observable. Tool timeouts/retries are application-level controls; an uncertain financial operation is not blindly replayed by the UI.

## 6:40–7:40 — Architecture/code walkthrough

Show the architecture diagram in `README.md` or `docs/architecture.md`.

Cover four boundaries only:

1. Next.js UI/API transport.
2. Responses API agent loop + strict tools.
3. Deterministic refund eligibility/execution.
4. SQLite persistence + admin observability.

Mention the 34-test gate, TypeScript, and production build.

## 7:40–8:30 — Voice bonus

If voice is stable on the recording machine, show one short microphone request.

Say:

> Voice is intentionally not a second agent. Realtime only transcribes the microphone, then the transcript goes into the same `/api/support/chat` endpoint and the same deterministic refund path. TTS reads only a persisted agent response.

Show the spoken reply or **Listen** replay.

If microphone permissions/browser audio are unreliable, skip the live mic and explain the architecture in under 20 seconds. Voice is bonus; do not risk the required refund demo.

## 8:30–9:00 — Close

Finish with:

> The main engineering decision here is separating LLM orchestration from financial authority. The model can reason about the conversation and select tools, while deterministic application code owns the policy and every refund write. The repository includes a deterministic reset and full verification command so the demo can be reproduced from a clean clone.

Then stop. Do not pad the video to ten minutes.

## Recording rules

- Reset the DB before the final take.
- Hide notifications and secrets.
- Use browser zoom that keeps the agent timeline legible.
- Keep terminal output ready to show `34 passed`, typecheck, and build success.
- Do not call admin events “chain-of-thought.” Call them **structured agent activity** or **observability events**.
- Do not imply SQLite is the production database choice; describe it as the self-contained take-home persistence choice.
