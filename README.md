# Jobform AI Customer Support Agent — Phase 1

Phase 1 is the business-logic foundation for the Jobform Automator Next.js developer assignment.

## What is included

- Next.js 16 App Router shell.
- 15 deterministic CRM customer profiles.
- E-commerce order fixtures with approval and denial demo cases.
- Strict refund policy in both human-readable and machine-readable form.
- Framework-independent deterministic refund eligibility engine.
- Repository interfaces so persistence can change without rewriting policy logic.
- Tool-facing functions ready for the Phase 2 LLM agent.
- Unit tests for approval, final sale, time window, used items, high-risk accounts, and quantity constraints.

## Engineering principle

The LLM will never decide refund eligibility from prose alone. It must gather data and invoke deterministic tools. This prevents prompt variance from changing money movement decisions and gives the admin dashboard auditable rule-by-rule evidence.

## Local setup

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run verify
npm run dev
```

Open `http://localhost:3000`.

Phase 1 requires no environment variables.

## Demo fixtures reserved for later phases

- Standard approval: customer `cus_001` / order `ord_demo_approve` / item `item_001`.
- Policy denial: customer `cus_002` / order `ord_demo_final_sale` / item `item_002`.
- Other denial paths include expired window, used item, high-risk customer, and over-quantity request.

## Next phase

Phase 2 will add SQLite persistence, OpenAI Responses API function calling, tool orchestration, retry/error handling, agent-run audit events, and refund execution idempotency. It will be delivered as an overlay patch ZIP containing only new/changed files.
