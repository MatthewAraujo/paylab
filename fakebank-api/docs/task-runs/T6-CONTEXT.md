# T6 Context

## Task

Lab surface behind `FAKEBANK_LAB_ENABLED`, Simulation Scenario registration (`POST /__test/scenarios`, upsert per Client and External Reference), atomic consumption of scenario attempts in the creation database transaction, and the business Outcomes `FAIL` and `DEFERRED`. Spec: [T6](../tasks/T6.md). Lane A; T9 (lane B) runs in parallel in the same worktree.

## Related PRD Acceptance Criteria

- AC-13: registration with Outcome, `delayMs` (0–120000), `failureCode` (required for `FAIL`, rejected otherwise), `retryAfterSeconds` (1–3600, only `RATE_LIMIT`), `times` (1–100, default 1); invalid combinations `400`; registering again replaces.
- AC-14: `FAIL` → `201`, `FAILED`, Failure Code, `completedAt` set; events `processing`, `failed`.
- AC-15: `DEFERRED` → `202`, `PROCESSING`, `completedAt` null; later reads still `PROCESSING`; only the `processing` event.
- AC-20 (FAIL/DEFERRED): `times: N` affects exactly N attempts, then immediate success.
- AC-23: scenarios scoped to the Client.
- AC-29: lab endpoints `404` when the flag is unset or false.
- AC-30: boot refused with the flag on and `NODE_ENV=production`.
- AC-12: lab endpoints documented only when enabled.

## Relevant Prior Summaries

- T2: `createProviderTransaction`, `transitionProviderTransaction` (`FAILED` needs a non-blank Failure Code, else `FAILURE_CODE_REQUIRED`).
- T3: `ClientAuthGuard` + `@CurrentClient()`, `ZodValidationPipe` (`400 VALIDATION_ERROR`), `provider_transaction.applied_outcome` already exists (diagnostic), events ordered by `sequence`.
- T4: `execute` returns `{ kind: 'created' | 'replayed' }`; Step 2 hook (pre-persistence, before insert) and Step 4 hook (post-commit, new row only); consume inside `insertAtomically` so a key conflict rolls the decrement back.
- T5: export the shared `externalReference` schema for the scenario body.

## Files Likely Affected

- `src/infra/env/env.ts` (flag + production refusal), `.env.example`.
- `prisma/migrations/<ts>_simulation_scenarios/migration.sql`, `prisma/schema.prisma`.
- New `src/infra/scenarios/` (schema, repository with the conditional decrement, Outcome decision) and `src/infra/lab/` (lab module, scenarios controller).
- `src/infra/app.module.ts` (lab module registered only when the flag is on).
- `src/infra/transactions/` (repository callback inside the database transaction, service composition, `202` in the controller and its OpenAPI response, exported `externalReference`).
- Tests: `test/infra/env.spec.ts`, `test/e2e/lab-disabled.e2e-spec.ts`, `test/e2e/scenarios.e2e-spec.ts`, `test/e2e/docs.e2e-spec.ts`, `test/support/setup-env.ts` (lab on for the test layers), `test/support/app.ts` (fresh boot with a given environment).

## Test-First Plan

From the task spec, at the HTTP seam (e2e) unless noted:

1. AC-30: env unit test, production + flag → refused naming `FAKEBANK_LAB_ENABLED`; e2e fresh boot with production + flag rejects.
2. AC-29: fresh boot with the flag unset and `false` → `POST /__test/scenarios` and the advance route `404` envelope; `/docs-json` has no `/__test` path (AC-12).
3. AC-12: with the flag on, `/docs-json` lists `/__test/scenarios`.
4. AC-13: valid registration `201` echo; invalid combinations table `400`; re-registration replaces Outcome and remaining attempts.
5. AC-14: `FAIL` → `201 FAILED` with Failure Code, events `processing`, `failed`.
6. AC-15: `DEFERRED` → `202 PROCESSING`, later GET `PROCESSING`, only `processing` event.
7. AC-20: `FAIL times: 2` → two failures then success.
8. AC-23: Client B unaffected by Client A's scenario, which stays untouched.
9. AC-1 regression: existing suites stay green.

## Constraints

- Do not edit lane B paths (Dockerfile, .dockerignore, docker-compose.yml, compose.yaml, both PROJECT.md files, T9 run files), `docs/TASKS.md`, dispatch, PRD, task specs.
- Single conditional decrement (`remaining_attempts > 0`) in the same database transaction as the insert.
- Outcome decision in the scenarios module; status transition in the T2 state machine; transactions flow composes.
- `appliedOutcome` stored for diagnosis only.
- Transport Outcomes and delays: accepted by registration, behavior is T8.

## Risks

- `@nestjs/config` validates at module import, so the flag must be set before `AppModule` is imported: fresh boots use `vi.resetModules` + dynamic import (paylab-api's benchmark pattern).
- Lab off with leftover scenarios in the database must not inject Outcomes.
- Changing the creation pipeline can regress T3/T4 behavior (idempotency, AC-31 concurrency).

## Definition of Done

All tests above pass; full gate (`lint`, `typecheck`, `test`, `test:e2e`, `test:integration`, `test:concurrency`) green; one commit with explicit paths; T6-summary.md written.
