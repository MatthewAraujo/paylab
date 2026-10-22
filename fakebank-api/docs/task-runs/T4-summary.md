# T4 Summary

## Status

done

## What Changed

`POST /v1/transactions` is now idempotent per Client and Idempotency Key.

- A retry with the same key and the same request answers `200` with `Idempotent-Replayed: true` and the Provider Transaction in its current state, built from the row.
- The same key with a different request answers `409 IDEMPOTENCY_KEY_REUSED`.
- Keys are scoped per Client.
- Parallel duplicates create exactly one row.

The unique `(client_id, idempotency_key)` index is the only arbiter. Nothing locks or looks up before the insert. On a violation, the insert's database transaction rolls back, the existing row is loaded, and its fingerprint is compared. OpenAPI now documents `200` (with the header) and `409`.

## Files Changed

- `src/infra/transactions/provider-transaction.repository.ts`: `insertWithEvents` returns `null` on a `(client, key)` unique violation (Prisma `P2002` whose target names `idempotency_key`). New `findByIdempotencyKey`.
- `src/infra/transactions/create-provider-transaction.service.ts`: `execute` returns `CreateProviderTransactionResult` (`{ kind: 'created' | 'replayed', transaction }`). Private `replay()` compares fingerprints and throws the `409`. The pipeline steps are documented, with the T6 hook points marked.
- `src/infra/transactions/transactions.controller.ts`: `@Res({ passthrough: true })` sets `200` plus `Idempotent-Replayed: true` on a replay. Adds `@ApiOkResponse` (with the header) and `@ApiConflictResponse`.
- `test/e2e/idempotency.e2e-spec.ts` (new), `test/e2e/docs.e2e-spec.ts`.
- `test/concurrency/idempotency.spec.ts` (new), `test/support/concurrency.ts` (new: wide-pool listening app, `inParallel`).
- `docs/task-runs/T4-CONTEXT.md`, this summary.

## Tests Added or Updated

- E2E `idempotency.e2e-spec.ts`:
  - AC-4: a replay answers `200`, `Idempotent-Replayed: true` and the same body; the first response has no header; there is 1 row and 2 events.
  - AC-4: after a direct SQL change to `FAILED`/`INSUFFICIENT_FUNDS`, a replay returns the new status, Failure Code and `updatedAt`.
  - AC-5: a different External Reference or Amount gets `409 IDEMPOTENCY_KEY_REUSED`, `retryable: false`; rows and events are unchanged.
  - AC-5 (currency): `USD` gets `422`, and the original is unchanged (see Decisions).
  - AC-6: two Clients with the same key get distinct ids, and each replay returns its own.
- E2E `docs.e2e-spec.ts` (AC-12): POST documents `200, 201, 400, 401, 409, 422`, the `Idempotent-Replayed` header on `200`, and the envelope on `409`.
- Concurrency `idempotency.spec.ts` (AC-31), 20 parallel requests:
  - identical requests: exactly one `201` and nineteen `200`, one id, 1 row, 2 events;
  - same key with different Amounts: one `201` and nineteen `409 IDEMPOTENCY_KEY_REUSED`; the single row is the winner's.
- AC-2: already covered by T3 (missing, empty, or 256-character key → `400`, nothing persisted). Still green.

TDD note:
- Red first: 5 of the 6 idempotency e2e tests failed with `500`. The currency/`422` case passed from the start, since T3 already refuses `USD`.
- The docs and concurrency tests were written after the code. Mutations proved they catch their bugs:
  - with `insertWithEvents` rethrowing the violation, both concurrency tests and 5 e2e tests failed;
  - with the fingerprint check removed, the `409` concurrency test and 2 e2e tests failed;
  - with the `200` header documentation removed, the docs test failed.

## Commands Run

`pnpm test:e2e <file>`, `pnpm test:concurrency`, `pnpm biome check --write <T4 paths>`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:integration`.

## Validation Result

- `pnpm lint`: pass (55 files).
- `pnpm typecheck`: pass.
- `pnpm test`: 24 tests pass.
- `pnpm test:e2e`: 5 files, 48 tests pass.
- `pnpm test:integration`: 2 tests pass.
- `pnpm test:concurrency`: 2 tests pass.

## Decisions Made

- **The insert decides, with no pre-check.** A losing concurrent insert blocks on the unique index until the winner commits, then raises `P2002`. Its whole Prisma interactive transaction rolls back, and the existing row is read after the rollback. If the winner rolled back instead, the loser's insert simply succeeds.
- **Violation detection is narrow.** Only a `P2002` whose `meta.target` names `idempotency_key` counts as a replay or conflict. Any other unique violation stays a `500`.
- **A reused key with a different currency is a `422`, not a `409`.** The PRD's attempt pipeline validates (including the currency check) before the idempotency step, and BRL is the only supported currency. That makes AC-5's currency variant unreachable over HTTP in October: any different well-formed currency is `UNSUPPORTED_CURRENCY`. The fingerprint still includes currency, so the `409` becomes reachable once a second currency exists. **Spec ambiguity for the orchestrator:** AC-5 lists currency among the differing fields; either accept this reading or reorder the pipeline in the PRD.
- **The replay status is set in the controller.** The service returns a tagged result. `@HttpCode(201)` stays the default, and the controller overrides it to `200` on a replay.

## Follow-up Needed

- Orchestrator: confirm the AC-5 currency reading above.
- `PROJECT.md` (lane B owns it now): mention `test/support/concurrency.ts` (`buildListeningApp`, `inParallel`) as the concurrency-layer helpers, and add the `Idempotent-Replayed` header and `409 IDEMPOTENCY_KEY_REUSED` to the API notes if they list response codes.

## Context for Next Task

- **The creation seam** is `CreateProviderTransactionService.execute(command) → { kind: 'created' | 'replayed', transaction }`. The controller maps `created` to `201` and `replayed` to `200` + `Idempotent-Replayed: true`.
- **T6 (pre-persistence Outcomes, AC-21).** Insert `RATE_LIMIT` / `ERROR_BEFORE_COMMIT` at the comment `Step 2 (T6) hooks here`, after the currency check and before `insertWithEvents`. They must apply even when the key already has a row, so they cannot come after the conflict check. Throw their error there; nothing is persisted.
- **T6 (scenario consumption on a new row).** The PRD wants the scenario attempt consumed inside the same database transaction as the insert. The cleanest extension is to pass a callback (or the transition decision) into the repository's `insertAtomically`, so the decrement runs inside the transaction. A key conflict then rolls back the decrement too, and a replay consumes nothing for free.
- **T6 (post-commit behavior).** Delay and `ERROR_AFTER_COMMIT` go at `Step 4 (T6) hooks here`, inside the `if (inserted)` branch. `replay()` returns before it, so a replay is never delayed and never re-applies an Outcome. A `202` for `DEFERRED` needs a third `kind`, or a status derived from the row, in the controller.
- **T5/T7/T8.** The replay reads the current row, so an advance (T7) is visible to replays without further work. `findByIdempotencyKey(clientId, key)` is available.
- **Concurrency tests.** `buildListeningApp()` (wide pool of 32 connections, `listen(0)`) and `inParallel(n, fn)` in `test/support/concurrency.ts`. AC-22 (scenario attempts under parallel load) can reuse them.
