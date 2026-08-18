# Architecture — Phase 1

## Decision

Use a single Next.js App Router application as the deployment boundary, while keeping business logic in framework-independent modules.

## Boundaries

- `src/domain/refunds`: domain types and authoritative policy constants.
- `src/services`: deterministic refund eligibility engine; no LLM, UI, or persistence dependencies.
- `src/repositories`: storage contracts and Phase 1 in-memory adapters.
- `src/tools`: application tools that the Phase 2 agent will invoke.
- `src/data`: deterministic take-home fixtures.
- `src/app`: presentation layer only.

## Critical rule

The LLM is an orchestrator and conversational layer, not the policy engine. Approval or denial is produced by deterministic code after explicit tool calls.

## Phase 2 storage

Replace the in-memory adapters behind repository interfaces with SQLite-backed repositories. The service layer and tests should remain unchanged.
