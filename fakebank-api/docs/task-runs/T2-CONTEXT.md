# T2 Context

## Task

Build a pure domain module for the Provider Transaction status model: statuses `PROCESSING`, `SUCCEEDED`, `FAILED`; creation (always `PROCESSING`, emitting `transaction.processing`); transitions to a terminal status (emitting `transaction.succeeded` or `transaction.failed`, setting `completedAt`). Refused transitions return a typed result, never throw. Spec: [T2](../tasks/T2.md).

## Related PRD Acceptance Criteria

- AC-26: only `PROCESSING → SUCCEEDED` and `PROCESSING → FAILED` are allowed; every other transition is refused.
- AC-27 (rules only; persistence is T3/T7): one Provider Transaction Event per status entered, in order.

## Relevant Prior Summaries

- [T1 summary](T1-summary.md): unit specs live in `test/**/*.spec.ts` outside `integration/`, `e2e/`, `concurrency/`; `@/` aliases `src/`; Biome (tabs, single quotes, no semicolons, width 100); pnpm 11.9.0.

## Files Likely Affected

- `src/domain/provider-transaction.ts` (new)
- `test/domain/provider-transaction.spec.ts` (new)

## Test-First Plan

Seam: the module's exported functions (`createProviderTransaction`, `transitionProviderTransaction`).

1. AC-27: creation yields `PROCESSING`, no `completedAt`, exactly one `transaction.processing` event with the injected id and timestamp. Bug: missing initial event.
2. AC-26: `PROCESSING → SUCCEEDED` allowed, one `transaction.succeeded` event, `completedAt` set. Bug: terminal transition not recorded or timestamp missing.
3. AC-26: `PROCESSING → FAILED` carries the Failure Code on transaction and event; a blank Failure Code is refused. Bug: failure without a reason.
4. AC-26: `SUCCEEDED → FAILED`, `FAILED → SUCCEEDED`, `SUCCEEDED → SUCCEEDED`, `FAILED → FAILED`, and any `→ PROCESSING` refused with `INVALID_TRANSITION` and no event (table-driven). Bug: a terminal transaction rewritten.
5. AC-27: creation then immediate decision yields events in order processing, then terminal. Bug: wrong event order.

## Constraints

- No imports from Nest, Prisma or `paylab-api`; pure TypeScript.
- Event ids and timestamps injected (deterministic tests).
- Do not edit `docs/TASKS.md`, the dispatch file, the PRD or task specs (lane mode).

## Risks

- Over-designing the transaction shape before T3 defines persistence: keep the module to status fields and let callers carry the rest (generic over extra fields).

## Definition of Done

- Tests above pass under `pnpm test`; `pnpm lint && pnpm typecheck && pnpm test` green; `pnpm test:e2e` still green.
- T2-summary.md written; one commit with module, tests, context and summary.
