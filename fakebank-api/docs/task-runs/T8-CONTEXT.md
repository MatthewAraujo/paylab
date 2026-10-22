# T8 Context

## Task

T8 — Transport Outcomes and delay ([docs/tasks/T8.md](../tasks/T8.md)). Complete the creation attempt pipeline with the Outcomes that fail at the transport level (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`, `ERROR_AFTER_COMMIT`) and the post-commit `delayMs`, including their interaction with idempotent replays and parallel attempts.

## Related PRD Acceptance Criteria

- AC-16: `RATE_LIMIT` → `429 PROVIDER_RATE_LIMIT`, `Retry-After` (default 1 or `retryAfterSeconds`), nothing persisted.
- AC-17: `ERROR_BEFORE_COMMIT` → `503 PROVIDER_UNAVAILABLE`, nothing persisted.
- AC-18: `ERROR_AFTER_COMMIT` → persisted `SUCCEEDED`, `500 PROVIDER_INTERNAL_ERROR`; retry with the same key → `200` replay of it.
- AC-19: `delayMs` applies after persistence; a client timeout leaves exactly one transaction.
- AC-20: `times: N` for every Outcome (`RATE_LIMIT` once, then `201`).
- AC-21: pre-persistence Outcomes apply and consume even on a persisted key; a replay consumes nothing else and is not delayed.
- AC-22: N parallel attempts with `times: K` → exactly K scenario-shaped responses.

## Relevant Prior Summaries

- T4: idempotency flow (insert, conflict → fingerprint compare → `409`/`200` replay from the current row).
- T6: `ScenarioAttempts.decideNewTransaction` consumes persisted Outcomes in the insert transaction (`outcome IN (...)` filter); `SimulationScenarioRepository.consumeAttempt(db, ...)` is one conditional `UPDATE ... RETURNING`; lab flag gates consumption; test layers run with the lab on.
- T7: nothing touches Steps 2/4. `ProviderTransactionRepository.applyDecision` untouched.

## Files Likely Affected

- `src/infra/scenarios/outcome.ts` (pre-persistence Outcome list), `scenario-attempts.service.ts` (`decideBeforePersistence`).
- `src/infra/transactions/create-provider-transaction.service.ts` (Steps 2 and 4).
- `src/infra/http/errors/` (an exception carrying `Retry-After`, written by `ErrorEnvelopeFilter`).
- `src/infra/transactions/transactions.controller.ts` (OpenAPI `429/500/503` + `Retry-After`).
- Tests: `test/e2e/transport-outcomes.e2e-spec.ts` (new), `test/concurrency/scenarios.spec.ts` (new), `test/e2e/docs.e2e-spec.ts`.

## Test-First Plan

Follow the task's Test-First Plan (e2e for AC-16..AC-21, concurrency suite for AC-22), one vertical slice at a time:

1. `RATE_LIMIT` → `429`, `Retry-After: 1`, envelope retryable, no row/event; `retryAfterSeconds: 30` → `Retry-After: 30`; `times: 1` then same key → `201`.
2. `ERROR_BEFORE_COMMIT` → `503`, nothing persisted; retry same key → `201`, one row.
3. `ERROR_AFTER_COMMIT` → `500`, lookup shows one `SUCCEEDED` with both events; retry → `200` replay, one row.
4. `SUCCEED` `delayMs: 1500`, client timeout 300 ms → timeout; row exists during the delay; after the delay retry → `200`, one row. `FAIL` with delay → `FAILED` persisted before the response.
5. AC-21: persisted key + `RATE_LIMIT` → replay `429` (consumed), next replay `200`; persisted key + delayed/`FAIL` scenario → `200` immediately, remaining attempts unchanged.
6. AC-22: `RATE_LIMIT times: 3`, 10 parallel distinct keys → 3×`429`, 7×`201`.
7. OpenAPI: `429/500/503` and `Retry-After` on `POST /v1/transactions`.

## Constraints

- Pre-persistence consumption is a single autocommitted conditional statement on `PrismaService`, outside any open transaction; its delay happens after that statement, before the error response (PRD pipeline: "Delay for pre-persistence Outcomes happens before their error response, with nothing persisted").
- Post-persistence delay only after the insert transaction committed, never inside it; non-blocking timer.
- Replays return before Step 4: no delay, no `500`.
- Lab flag gates the pre-persistence consumption too.
- Error envelope only via `ErrorEnvelopeFilter`; `retryable` is decided in `error-envelope.ts`.
- Do not edit PRD, task files, TASKS.md, dispatch, PROJECT.md.

## Risks

- Timing tests flaky under load: keep delays ≤1.5 s with wide margins; assert counts, not ordering.
- A `500` thrown from Step 4 must not be logged as an unexpected error; use an `HttpException` with code `PROVIDER_INTERNAL_ERROR`.
- Supertest timeout leaves the server-side request running: wait past the delay before the next test resets the database.

## Definition of Done

All Test-First Plan tests pass; full gate green (`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`), e2e run twice; T8-summary.md written; one commit with explicit paths.
