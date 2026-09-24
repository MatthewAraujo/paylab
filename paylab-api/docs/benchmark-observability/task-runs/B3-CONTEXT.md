# B3 Context

## Task

Turn benchmark preparation, deterministic reset, validation gates, and the T13 read/query-plan experiments into a registered suite executed by the B2 shell. Spec: `../tasks/B3.md`.

## Related PRD Acceptance Criteria

US-7..10 (guarded benchmark database, deterministic reset, isolation, preflight), US-17/19 (gates make a Run INCOMPLETE), US-35 (T13 protocol: one warm-up, seven measured executions, median), US-37/38 (protocol declared per scenario), US-43 (query latency and plan evidence), US-65.

## Relevant Prior Summaries

`task-runs/B2-summary.md`: scenarios are `ScenarioSpec` (command + args) that print `BENCH_RESULT <metrics json>`; `suite.prepare()` runs preflight and returns the dataset; `RunOptions.environment` carries environment facts; registry is `scripts/benchmark/suite.ts` (empty). `task-runs/B1-summary.md`: contract, `scenarioFingerprint`, `summaryRole`.

## Files Likely Affected

- `scripts/benchmark/executor.ts`, `store.ts` (additive: per-scenario `prepare` hook, environment facts from `prepare()`, extra Artifacts written by a scenario into `BENCH_ARTIFACT_DIR`, file name by Artifact kind), `src/domain/benchmark/` (artifact file naming).
- New `bench/lib/{database,preflight,targets}.ts`, `bench/scenarios/{measure,t13-queries,t13-reads}.ts`, `scripts/benchmark/suite.ts`; `bench/run.ts` (`bench:template`), `package.json`, `.env.example`.
- Tests: unit specs for measurement, guard, query definitions, registry, executor additions; integration specs (Testcontainers, small dataset) for template, reset, isolation, preflight failures, gates, and a reduced end-to-end Run.

## Test-First Plan

Unit: median and Execution Time parsing, `measureQuery` protocol with a controlled executor (warm-up discarded, seven samples), guard refusals, query definitions and fingerprints, executor hook/artifact/environment additions. Integration on a small dataset in an isolated Testcontainers server: snapshot template, restore, equal digests twice, mutation isolation, each preflight failure, invariant gate, every T13 query executes, reduced real Run publishes metrics and plan Artifacts.

## Constraints

- NEVER touch the developer's real benchmark container (`paylab-postgres-bench`, port 5433) or its `paylab_bench` and template databases: tests use Testcontainers only, and `pnpm benchmark:run` is not run for real in this task.
- Reuse `bench/lib/seed.ts`, `bench/lib/stats.ts`, and `scripts/demo/apply.ts` `findInvariantViolations`; keep the "bench" name guard semantics.
- Keep the T13 protocol (1 warm-up, 7 measured, median). Never run the full destructive setup in the fast gate.
- Do not edit the PRD or task files.

## Risks

- Restoring from a template then migrating means schema changes are measured but not part of the dataset fingerprint (intended: an index change is the change under test).
- T13 targets are now discovered from the database (deterministic given the seed) instead of hardcoded ids, so native T13 numbers are comparable in method, not byte-identical, with the imported ones.
- No separate Docker preflight: an unreachable PostgreSQL is reported with the `pnpm bench:up` hint.

## Definition of Done

Executor publishes structured T13 metrics and plans with correctness gates on a small isolated database; `pnpm test`, `pnpm test:integration` (new specs), `pnpm typecheck`, `pnpm lint` green; one commit with code, tests, this file, the summary, and the index update.
