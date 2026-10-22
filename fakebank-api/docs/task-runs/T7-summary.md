# T7 Summary

## Status

done

## What Changed

- **Lab advance route.** `POST /__test/transactions/:providerTransactionId/advance` is now part of `LabModule`, so it exists only with `FAKEBANK_LAB_ENABLED=true`. It is authenticated with `ClientAuthGuard` and scoped to the Client.
  - Body: `{ status: 'SUCCEEDED' | 'FAILED', failureCode? }`. `failureCode` is required for `FAILED` and refused for `SUCCEEDED`. It uses the same rule as scenarios: trimmed, non-blank, at most 64 characters.
  - `200`: the Provider Transaction representation in its new state, with `completedAt` set and `updatedAt = completedAt`.
  - `400 VALIDATION_ERROR`: an invalid body (`PROCESSING`, an unknown or missing status, `FAILED` without a code, a code on `SUCCEEDED`).
  - `404 TRANSACTION_NOT_FOUND`: an unknown id or another Client's id.
  - `409 INVALID_TRANSITION`: the transaction is already terminal, or a concurrent advance won first.
- **Decision flow** (`AdvanceProviderTransactionService`): `findForClient`, then T2's `transitionProviderTransaction`, then `ProviderTransactionRepository.applyDecision`. The state machine's `INVALID_TRANSITION` maps to `409`. `FAILURE_CODE_REQUIRED` maps to `400 VALIDATION_ERROR`; the schema already prevents it.
- **Concurrency guard.** `applyDecision(clientId, change)` runs in one Prisma interactive transaction:
  - `updateMany WHERE id AND client_id AND status = 'PROCESSING'`;
  - if 0 rows matched, it returns `null` (mapped to `409`) and writes no event;
  - otherwise it inserts the terminal event (`sequence` comes from the identity column) and returns the row.
  - Under READ COMMITTED, the losing update blocks on the row lock and then re-evaluates the condition, so it matches nothing.
- `TransactionsModule` now exports `ProviderTransactionRepository` and `DOMAIN_CLOCK`. `LabModule` imports it.
- The Failure Code Zod schema is extracted as `failureCode` in `scenario.schemas.ts` and shared by both lab bodies. Scenario behavior is unchanged.
- OpenAPI documents the route under the `lab` tag (`200/400/401/404/409`, bearer auth, `AdvanceProviderTransactionRequest`). Like the rest of the lab, it appears only when the lab is enabled.

## Files Changed

- `src/infra/lab/advance.controller.ts` (new), `src/infra/lab/advance-provider-transaction.service.ts` (new), `src/infra/lab/advance.schemas.ts` (new), `src/infra/lab/lab.module.ts`
- `src/infra/transactions/provider-transaction.repository.ts` (`applyDecision`, shared `eventData`), `src/infra/transactions/transactions.module.ts` (exports)
- `src/infra/scenarios/scenario.schemas.ts` (exported `failureCode`)
- `test/e2e/advance.e2e-spec.ts` (new), `test/concurrency/advance.spec.ts` (new), `test/e2e/docs.e2e-spec.ts`
- `docs/task-runs/T7-CONTEXT.md`, this summary

## Tests Added or Updated

- E2E `advance.e2e-spec.ts` (16 tests). Deferred transactions are created through a `DEFERRED` scenario.
  - AC-24/AC-27: advance to `SUCCEEDED` → `200`, `completedAt` set, a later GET is identical, events `processing`, `succeeded`.
  - AC-24/AC-27: advance to `FAILED` with `ACCOUNT_BLOCKED` → `200`, code on the row and the event.
  - AC-24: six invalid bodies → `400 VALIDATION_ERROR`; the row is still pending with 1 event.
  - AC-4: a replay of the original creation after advancing → `200`, `Idempotent-Replayed: true`, body equal to the advanced state.
  - AC-25: already `SUCCEEDED` (to `FAILED` and to `SUCCEEDED`) or already `FAILED` → `409 INVALID_TRANSITION`; the row is unchanged with 2 events. A transaction that succeeded on creation → `409`.
  - AC-25: another Client's id → `404`, still pending; an unknown id → `404`.
  - AC-9: no key → `401`, still pending.
- Concurrency `advance.spec.ts` (AC-25): 10 parallel advances, mixing `SUCCEEDED` and `FAILED`, give exactly one `200` and nine `409 INVALID_TRANSITION`. The row's status matches the winner, and the events are `[PROCESSING, winner]`.
- E2E `docs.e2e-spec.ts` (AC-12): the advance route is documented with `200/400/401/404/409`, bearer auth, the `ProviderTransactionResponse`/envelope refs and the status enum.
- AC-29: `lab-disabled.e2e-spec.ts` (T6) already probes the advance route. It still answers `404` with the lab off.
- TDD:
  - The first e2e test was watched red (`404`, no route). The implementation was then written as one slice, so the later tests went green on their first run.
  - Mutations proved the tests catch their bugs. Each mutation was applied, run, and reverted from a scratchpad backup:
    - status guard removed from the update → the concurrency test is red;
    - Client scope removed from `findForClient` → the cross-Client test is red;
    - event insert removed → 5 e2e tests are red;
    - schema refinements removed → the "code on SUCCEEDED" test is red. "FAILED without a code" stays `400` through the state machine's `FAILURE_CODE_REQUIRED` fallback, by design;
    - the `409` documentation removed → the docs test is red.

## Commands Run

`pnpm test:e2e <file>`, `pnpm test:concurrency <file>`, `pnpm typecheck`, `pnpm biome check --write src test`, then the gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`.

## Validation Result

All green.

- Lint: 72 files clean.
- Typecheck: clean.
- Unit: 28/28.
- E2E: 108/108 (9 files).
- Integration: 2/2.
- Concurrency: 3/3 (2 files).

## Decisions Made

- **The SQL guard decides the race, not the state machine.** The state machine refuses the sequential case with a precise `from`. The guarded `updateMany` refuses the concurrent loser. Both answer `409 INVALID_TRANSITION`, so a Client cannot tell them apart, and does not need to.
- **A `failureCode` on `SUCCEEDED` is a `400`**, mirroring scenario registration (an impossible decision is refused instead of ignored).
- **Body validation before the lookup.** The body is validated by the pipe before the lookup, so an invalid body on an unknown id is a `400`, not a `404`. This follows Nest's normal order (guards → pipes → handler), as in the other routes.
- **No pessimistic lock or SERIALIZABLE.** A conditional update under READ COMMITTED is enough, and it is the same pattern as T6's attempt consumption.
- The advance service lives in `src/infra/lab` (lab-only use case); the repository method lives with the other Provider Transaction persistence.

## Follow-up Needed

- **Docs owner, `fakebank-api/PROJECT.md`:**
  - Structure table: `src/infra/lab` also holds the advance use case (`advance.controller.ts`, `advance-provider-transaction.service.ts`).
  - Optionally add a curl example: `curl -X POST localhost:4000/__test/transactions/<id>/advance -H 'Authorization: Bearer fakebank-dev-key-paylab-not-a-secret' -H 'Content-Type: application/json' -d '{"status":"FAILED","failureCode":"ACCOUNT_BLOCKED"}'`.
- No CONTEXT.md change: the decisions above are implementation details already implied by the PRD.

## Context for Next Task

- **T8:** nothing in this task touches the creation pipeline's Step 2/Step 4 hooks.
- `ProviderTransactionRepository.applyDecision(clientId, change)` is the only path that changes an existing row. Any future status change (e.g. a scheduled decision) should reuse it to keep the `WHERE status = 'PROCESSING'` guard and the same-transaction event.
- The lab helper pattern for a deferred transaction is in `test/e2e/advance.e2e-spec.ts` (`deferred()`): register `DEFERRED`, then create, expecting `202`.
- `TransactionsModule` exports `ProviderTransactionRepository` and `DOMAIN_CLOCK`.
