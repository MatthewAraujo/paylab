# T6 Summary

## Status

done

## What Changed

- **Lab flag.** `FAKEBANK_LAB_ENABLED` (default `false`) is validated at boot. With `NODE_ENV=production` and the flag on, the env schema refuses to start.
- **Lab module.** `LabModule` (`/__test/...`) is imported by `AppModule` through `ConditionalModule.registerWhen` only when the flag is `true`. Otherwise its routes do not exist: they answer `404 NOT_FOUND` like any unknown route and are absent from `/docs`.
- **Scenario registration.** `POST /__test/scenarios` registers a Simulation Scenario per (Client, External Reference). It upserts, so registering again replaces the Outcome and the remaining attempts. The body accepts all six Outcomes with their combination rules.
- **Attempt consumption.** For a new Provider Transaction, one scenario attempt is consumed by a single conditional `UPDATE ... WHERE remaining_attempts > 0 ... RETURNING` inside the insert's database transaction, so an Idempotency Key conflict rolls the consumption back.
  - `FAIL` → `201`, `FAILED` with the Failure Code, events `processing`, `failed`.
  - `DEFERRED` → `202`, `PROCESSING`, `completedAt` null, only the `processing` event.
  - `SUCCEED` and `ERROR_AFTER_COMMIT` → `SUCCEEDED` (T8 adds the post-commit `500`).
  - `RATE_LIMIT` and `ERROR_BEFORE_COMMIT` are not consumed yet (T8).
- **Applied Outcome.** It is stored in `provider_transaction.applied_outcome` for diagnosis only.
- **Lab off.** With the lab off, consumption is skipped entirely, even if scenarios remain in the database.

## Files Changed

- Env: `src/infra/env/env.ts`, `.env.example`.
- Schema: `prisma/migrations/20261022100000_simulation_scenarios/migration.sql` (new), `prisma/schema.prisma`.
- Scenarios (new): `src/infra/scenarios/{outcome,scenario.schemas,simulation-scenario.repository,scenario-attempts.service,scenarios.module}.ts`.
- Lab (new): `src/infra/lab/{lab.module,scenarios.controller,scenario.representation}.ts`.
- App: `src/infra/app.module.ts`.
- Transactions: `create-provider-transaction.service.ts`, `provider-transaction.repository.ts` (`insertWithEvents(build)` takes a builder that receives the database transaction), `transactions.controller.ts` (`202` + `@ApiAcceptedResponse`), `transactions.module.ts` (imports `ScenariosModule`), `transaction.schemas.ts` (`externalReference` exported).
- Tests: `test/infra/env.spec.ts`, `test/e2e/scenarios.e2e-spec.ts` (new), `test/e2e/lab-disabled.e2e-spec.ts` (new), `test/e2e/docs.e2e-spec.ts`, `test/support/setup-env.ts`, `test/support/fresh-app.ts` (new).
- `docs/task-runs/T6-CONTEXT.md`, this summary.

## Tests Added or Updated

- Unit `env.spec.ts`: the flag parses unset/`false`/`true` (AC-29), and production + flag is refused naming `FAKEBANK_LAB_ENABLED` (AC-30).
- E2E `lab-disabled.e2e-spec.ts`. Each case is a fresh boot through `bootWithEnv`.
  - AC-29: flag unset or `false` → `POST /__test/scenarios` and `POST /__test/transactions/:id/advance` answer the `404 NOT_FOUND` envelope.
  - AC-12: `/docs-json` has no `/__test` path.
  - AC-29: a scenario registered while the lab was on is ignored once it is off.
- E2E `scenarios.e2e-spec.ts`:
  - AC-13: `201` echo with defaults and with every optional field; 17 invalid bodies → `400 VALIDATION_ERROR` with nothing stored; re-registration replaces.
  - AC-9: `401` without a key.
  - AC-14: `FAIL` → `201 FAILED`, events in order, `appliedOutcome` stored.
  - AC-15: `DEFERRED` → `202 PROCESSING`; a later GET is identical; one event.
  - AC-20: `FAIL times: 2` → two failures, then success.
  - AC-23: another Client is unaffected and does not consume the scenario.
  - Another External Reference is unaffected.
  - AC-21: a replay does not consume an attempt.
- E2E `docs.e2e-spec.ts`: POST `/v1/transactions` documents `202`. With the lab on, `/__test/scenarios` documents `201/400/401`, bearer auth, the envelope and the Outcome enum (AC-12).
- TDD: the env tests, registration, `FAIL` and `DEFERRED` were watched red first. The later cases were written after the implementation, and mutations proved they catch their bugs. Each mutation was applied, run, and reverted by copying the file back:
  - lab always registered → 3 lab-disabled tests red;
  - `remaining_attempts > 0` removed → AC-20 and replacement red;
  - client filter removed from the decrement → AC-23 red;
  - lab gate removed from consumption → "ignores registered scenarios" red;
  - consumption moved outside the insert's database transaction → replay test red.
- AC-30 manual check: `node dist/infra/main.js` with `NODE_ENV=production FAKEBANK_LAB_ENABLED=true` exits 1 with `Invalid environment configuration: FAKEBANK_LAB_ENABLED: Must not be true when NODE_ENV is production`. With the flag `false`, it passes validation.

## Commands Run

`pnpm prisma:generate`, `pnpm test <file>`, `pnpm test:e2e <files>`, `pnpm biome check --write src test`, `pnpm build`, the manual boot above, then the gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`.

## Validation Result

All green.

- Lint: 67 files clean.
- Typecheck: clean.
- Unit: 28/28.
- E2E: 91/91 (8 files).
- Integration: 2/2.
- Concurrency: 2/2.

## Decisions Made

- **The test layers run with the lab on** (`setup-env.ts` forces `FAKEBANK_LAB_ENABLED=true`, like the development stacks). Lab-off behavior uses `bootWithEnv(env)` (`test/support/fresh-app.ts`): it sets the variables, runs `vi.resetModules()` and dynamically imports `buildTestApp`. The configuration and the conditional module are resolved when `AppModule` is imported.
- **AC-30 is not an e2e test.** `@nestjs/config` validates while `AppModule` is being imported, so a refused boot in vitest surfaces as an unhandled rejection that cannot be caught cleanly. The refusal is covered by the env unit test (the exact `validate` the app uses) and by the manual boot of the build. This follows `paylab-api`'s benchmark precedent.
- **Consumption is gated by the flag**, not only registration. The lab flag is the only barrier against scenario injection, so leftover scenarios must not apply with the lab off.
- **`202` comes from the row's status.** The controller answers `202` for a `created` result whose status is `PROCESSING`. No third result kind was added.
- **Outcome split.** Persisted Outcomes (`SUCCEED`, `FAIL`, `DEFERRED`, `ERROR_AFTER_COMMIT`) are consumed in the insert transaction. Pre-persistence ones (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`) are filtered out there (`outcome IN (...)` in the same conditional statement), so T8 consumes them at Step 2. Each scenario has one Outcome, so the two sets never compete.
- **Scenario table.**
  - Primary key `(client_id, external_reference)`.
  - `delay_ms` stored as `0` when omitted. `retry_after_seconds` stays NULL when omitted, and T8 applies the default of 1.
  - `remaining_attempts` is 0–100 and rows are kept at 0.
  - CHECKs mirror the body rules: known Outcome, delay range, Failure Code iff FAIL, retry-after only for RATE_LIMIT and in range.
  - A CHECK keeps `provider_transaction.applied_outcome` to known values.
- **Failure Code.** It is trimmed, non-blank and at most 64 characters, with no closed list. Because it is validated, `FAILURE_CODE_REQUIRED` cannot arise; if the state machine refused anyway, that would be a `500`.
- **Registration response.** `{ externalReference, outcome, delayMs, failureCode, retryAfterSeconds, times }`, where `times` is the stored remaining attempts. It answers `201` on both creation and replacement.

## Follow-up Needed

- **Lane B / docs owner, `fakebank-api/PROJECT.md`:**
  - Structure table: add `src/infra/scenarios` (registration storage, conditional attempt decrement, Outcome decision) and `src/infra/lab` (lab controllers, imported only with the flag).
  - `FAKEBANK_LAB_ENABLED` row: drop "read by the service once T6 lands; ignored before".
  - Conventions: the test layers run with the lab on (`setup-env.ts`); boot another environment with `bootWithEnv` (`test/support/fresh-app.ts`).
  - Optionally a curl example of `POST /__test/scenarios`.
- **Lane B / docs owner, workspace `PROJECT.md`:** nothing required.
- **T7 owns the advance route.** The AC-29 test already probes `POST /__test/transactions/FBK-any/advance` → `404` with the lab off, so it stays meaningful once the route exists.

## Context for Next Task

- **Outcome decision.** It lives in `ScenarioAttempts.decideNewTransaction(db, clientId, externalReference)` (`src/infra/scenarios/scenario-attempts.service.ts`), which returns `NewTransactionDecision { appliedOutcome, transition, delayMs }`. The state transition stays in `@/domain/provider-transaction`. `CreateProviderTransactionService` composes them inside `repository.insertWithEvents(async (db) => ...)`.
- **T7 (advance).**
  - Add an `AdvanceController` to `LabModule`'s `controllers` (it already provides `ClientAuthGuard`), at `__test/transactions/:providerTransactionId/advance`.
  - Load with `findForClient` (404 otherwise) and call `transitionProviderTransaction`. Map `INVALID_TRANSITION` → `409`, and `FAILURE_CODE_REQUIRED` or a missing code → `400`.
  - Persist the status update and the event in one database transaction. Guard the update with `WHERE status = 'PROCESSING'` so two concurrent advances cannot both win.
  - `LabModule` would need `TransactionsModule` to export `ProviderTransactionRepository`, or a lab-local repository method.
  - DEFERRED rows have `appliedOutcome = 'DEFERRED'`; never branch on it.
- **T8.**
  - `RATE_LIMIT` / `ERROR_BEFORE_COMMIT`: at `Step 2 (T8) hooks here`, call `SimulationScenarioRepository.consumeAttempt(this.prisma, clientId, ref, ['RATE_LIMIT', 'ERROR_BEFORE_COMMIT'])`, gated by the lab flag like `ScenarioAttempts` (add a method there, e.g. `decideBeforePersistence`). Apply `delayMs`, then throw `429` (with `Retry-After` = `retryAfterSeconds ?? 1`) or `503`. This runs before the idempotency step, so it applies on replays too (AC-21).
  - `delayMs` / `ERROR_AFTER_COMMIT`: at `Step 4 (T8) hooks here`, read the `decision` variable (`decision.delayMs`, `decision.appliedOutcome === 'ERROR_AFTER_COMMIT'` → throw `500 PROVIDER_INTERNAL_ERROR` after the delay). A replay returns before Step 4.
  - AC-22: the decrement is already one conditional statement. Use `buildListeningApp()` and `inParallel()`. The test layers have the lab on by default, so no `bootWithEnv` is needed.
- **Tests.** Register with `POST /__test/scenarios` (see `register()` in `test/e2e/scenarios.e2e-spec.ts`). `resetDatabase()` truncates `simulation_scenario` too.
