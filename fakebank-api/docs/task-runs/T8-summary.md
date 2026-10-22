# T8 Summary

## Status

done

## What Changed

The creation attempt pipeline is complete.

- **Step 2, pre-persistence Outcomes.** `ScenarioAttempts.decideBeforePersistence(clientId, externalReference)` consumes one attempt of a `RATE_LIMIT` or `ERROR_BEFORE_COMMIT` scenario.
  - It uses T6's single conditional `UPDATE ... RETURNING`, run on `PrismaService`, so it autocommits and no transaction stays open.
  - It is gated by the lab flag, like the in-transaction consumption.
  - The service then waits `delayMs` and throws:
    - `429 PROVIDER_RATE_LIMIT` with `Retry-After` = `retryAfterSeconds ?? 1`;
    - or `503 PROVIDER_UNAVAILABLE`.
  - Nothing is persisted. The step runs after the currency check and before the idempotency step, so it also applies to a key that already has a Provider Transaction (AC-21).
- **Step 4, after commit, new row only.** The service waits `decision.delayMs` after the insert transaction committed. With `ERROR_AFTER_COMMIT`, it then throws `500 PROVIDER_INTERNAL_ERROR`; the row is already `SUCCEEDED` with both events. A replay returns before Step 4, so it is never delayed and never answers `500`.
- **`Retry-After`.** `HttpExceptionWithHeaders` (`src/infra/http/errors/http-exception-with-headers.ts`) carries response headers. `ErrorEnvelopeFilter` writes them; the body stays the standard envelope.
- **Outcome lists.** `PRE_PERSISTENCE_OUTCOMES` / `PrePersistenceOutcome` sit next to `PERSISTED_OUTCOMES` in `outcome.ts`.
- **OpenAPI.** `POST /v1/transactions` documents `429` (with the `Retry-After` header), `500` and `503`, all typed with `ErrorEnvelopeResponse`, and the descriptions say how to retry.

## Files Changed

- `src/infra/transactions/create-provider-transaction.service.ts`, `src/infra/transactions/transactions.controller.ts`
- `src/infra/scenarios/scenario-attempts.service.ts`, `src/infra/scenarios/outcome.ts`
- `src/infra/http/errors/http-exception-with-headers.ts` (new), `src/infra/http/errors/error-envelope.filter.ts`
- `test/e2e/transport-outcomes.e2e-spec.ts` (new), `test/concurrency/scenarios.spec.ts` (new), `test/e2e/docs.e2e-spec.ts`, `test/e2e/lab-disabled.e2e-spec.ts`
- `docs/task-runs/T8-CONTEXT.md`, this summary

## Tests Added or Updated

- **E2E `transport-outcomes.e2e-spec.ts` (15 tests).** The app listens on an ephemeral port so that a timed-out supertest request does not close a server still serving it.
  - AC-16: `RATE_LIMIT` → `429`, `Retry-After: 1`, `PROVIDER_RATE_LIMIT`, `retryable: true`, no row and no event. `retryAfterSeconds: 30` → `Retry-After: 30`.
  - AC-20: `RATE_LIMIT times: 1` → `429`, then the same key → `201 SUCCEEDED`, one row.
  - AC-17: `ERROR_BEFORE_COMMIT` → `503 PROVIDER_UNAVAILABLE`, no `Retry-After`, nothing persisted. The same key then gets `201`, and the lookup shows exactly one row.
  - AC-18: `ERROR_AFTER_COMMIT` → `500 PROVIDER_INTERNAL_ERROR`, while the lookup shows one `SUCCEEDED` row with events `PROCESSING`, `SUCCEEDED`. A retry with the same key → `200`, `Idempotent-Replayed: true`, equal to the only row.
  - AC-19: `SUCCEED delayMs: 1500` with a 300 ms client timeout → the client times out, and the row already exists `SUCCEEDED` during the delay. After the delay, a retry with the same key → `200` with the same id, and there is still one row.
  - AC-19: `FAIL delayMs: 1000` → the `FAILED` row with its code is visible before the response arrives, and the response (`201 FAILED`) takes at least 1000 ms.
  - AC-20: table over `RATE_LIMIT`/`ERROR_BEFORE_COMMIT`/`ERROR_AFTER_COMMIT` with `times: 2` → `[status, status, 201]`.
  - AC-21: on a persisted key, a `RATE_LIMIT times: 1` scenario → the replay gets `429` and remaining attempts drop to 0; the next replay → `200` with the same id.
  - AC-21: table over `FAIL`/`SUCCEED`/`ERROR_AFTER_COMMIT` with `delayMs: 2000, times: 2` on a persisted key → the replay gets `200` with an unchanged body in under 1000 ms, and remaining attempts are still 2.
- **Concurrency `scenarios.spec.ts` (AC-22).** 10 parallel attempts with distinct keys against `times: 3`:
  - `RATE_LIMIT` → exactly 3×`429` and 7×`201`, 7 rows;
  - `ERROR_AFTER_COMMIT` → exactly 3×`500` and 7×`201`, 10 rows;
  - in both cases the scenario ends with 0 remaining attempts.
- **`docs.e2e-spec.ts`.** Creation documents `429/500/503` with the envelope schema, and `429` documents `Retry-After`.
- **`lab-disabled.e2e-spec.ts` (AC-29).** "Ignores registered scenarios when off" is now a table over `FAIL` and `RATE_LIMIT`, covering both consumption points.
- **TDD.**
  - Watched red first: `RATE_LIMIT` (3 tests), `ERROR_BEFORE_COMMIT`, `ERROR_AFTER_COMMIT` and both delay tests, and the docs test.
  - Mutations proved that the tests which went green on first run catch their bug. Each mutation was applied, run, and reverted from a scratchpad backup:
    - pre-persistence consumption moved inside the insert transaction → 5 e2e tests red, including the AC-21 replay and the `times` tests;
    - the delay moved before the `inserted` check (so a replay waits) → the 3 AC-21 replay tests red;
    - the `remaining_attempts > 0` guard removed → both AC-22 concurrency tests red;
    - the lab gate removed from `decideBeforePersistence` → the lab-off `RATE_LIMIT` case red.

## Commands Run

- Per-file runs: `pnpm test:e2e <file>`, `pnpm test:concurrency <file>`.
- `pnpm biome check --write src test`.
- The gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`. The first typecheck failed on a `never[]` inference in the new test; after the fix, typecheck, lint and that test file were run again.

## Validation Result

All green.

- Lint: 75 files clean.
- Typecheck: clean.
- Unit: 28/28.
- E2E run 1: 124/124 (10 files).
- E2E run 2: 124/124 (10 files).
- Integration: 2/2.
- Concurrency: 5/5 (3 files).

## Decisions Made

- **Delay of pre-persistence Outcomes.** The PRD pipeline says it explicitly: "Delay for pre-persistence Outcomes happens before their error response, with nothing persisted". So `RATE_LIMIT`/`ERROR_BEFORE_COMMIT` wait `delayMs` before answering. The attempt is consumed by an autocommitted statement first, so the wait never holds a database transaction.
- **Pre-persistence consumption is autocommitted, not rolled back.** If the client disconnects during the delay, the attempt stays consumed. This matches AC-21 ("apply and consume attempts even when ...") and a real rate limiter.
- **Order relative to the fingerprint check.** The PRD order puts Step 2 before idempotency. A persisted key retried with a different body while a `RATE_LIMIT` scenario has attempts left therefore gets `429`, not `409`. The next attempt, once the scenario is exhausted, gets the `409`.
- **The `500` for `ERROR_AFTER_COMMIT` is an `HttpException`** with code `PROVIDER_INTERNAL_ERROR`, not an unexpected error. It is not logged as a crash, and the filter still replaces the 5xx message with the generic one.
- **Headers on errors.** `HttpExceptionWithHeaders` is a generic class instead of a rate-limit-specific branch in the filter, so the filter stays free of business knowledge.
- **Timing tests.** The 300 ms client timeout against a 1500 ms delay, polling up to 1 s for the persisted `FAIL` row against a 1000 ms delay, and the replay bound of 1000 ms against a 2000 ms delay all leave wide margins. Both e2e runs were green.

## Follow-up Needed

- **Docs owner, `fakebank-api/PROJECT.md`:**
  - Conventions → Errors: business errors that need response headers throw `HttpExceptionWithHeaders` (`src/infra/http/errors/http-exception-with-headers.ts`); `ErrorEnvelopeFilter` writes the headers (currently only `Retry-After` on `429`).
  - Structure, `src/infra/transactions`: the creation service now runs the whole attempt pipeline, including the pre-persistence transport errors and the post-commit delay.
  - Optionally a curl example registering `RATE_LIMIT` with `retryAfterSeconds`.
- **`CONTEXT.md`:** no change needed. The decisions above apply the PRD and CONTEXT text, which already states that delays happen after persistence and that pre-commit Outcomes still apply on replay. The docs owner may record the "`429` before `409` on a mismatched body" consequence if it is considered durable.

## Context for Next Task

- T8 was the last implementation task: every Outcome is now live. The pipeline is documented in the class comment of `CreateProviderTransactionService`.
- E2E tests that need a client-side timeout must call `app.listen(0)` first (see `transport-outcomes.e2e-spec.ts`). Otherwise supertest closes its per-request server under the request that is still in flight.
- Pending work for a PR: run `pr-review` across the FakeBank branch.
