# B3 Summary

## Status

Done. The dataset gate, deterministic reset, preflight, and the T13 read/query-plan scenarios are registered and run end to end on a small isolated database. The full T13 workload was not run (manual validation in B8), and the developer's real benchmark container was never touched.

## What Changed

- **Guard** (`bench/lib/database.ts`): `assertBenchDatabaseUrl` requires a set, valid, local URL, a plain-identifier name containing "bench", different from `DATABASE_URL`'s server and database, and a template name that is a different plain identifier (default `<db>_template`, or `BENCH_TEMPLATE_DATABASE`, e.g. the existing `paylab_bench_adopted`).
- **Template and reset** (`bench/lib/reset.ts`): `snapshotTemplate` freezes the validated database as a template and records its dataset digest in the template's comment; `restoreBenchmarkDatabase` terminates connections, drops the database, recreates it from the template, runs `prisma migrate deploy` so the schema matches the revision under test, then `VACUUM (ANALYZE)`. New `pnpm bench:template` snapshots (and refuses an invalid dataset).
- **Preflight** (`bench/lib/preflight.ts`): `PreflightError` with a step (`environment`, `postgres`, `template`, `restore`, `migrations`, `dataset`, `invariants`) and a fix hint. `checkPrerequisites` (PostgreSQL reachable, template exists) has no side effects and runs in the CLI before a Run is opened; `prepareBenchmarkDatabase` restores, validates (`bench/lib/validate.ts`, reusing `collectDatasetStats` and the demo `findInvariantViolations`), compares the digest to the template's recorded one, and returns fingerprint = dataset digest, a description, and PostgreSQL facts (version and settings). `bench:validate` now shares `validateDataset`.
- **T13 scenarios**: `bench/scenarios/measure.ts` (1 warm-up, 7 measured, median, range, last plan), `bench/lib/targets.ts` (hot/cold Wallet and Merchant discovered from the data), `bench/scenarios/t13-queries.ts` (33 registered scenarios: history, balance, Payment list variants, reports, rare account filter, keyset versus offset depth; SQL text hash in the config), `bench/scenarios/t13-reads.ts` (process entry: prints `BENCH_RESULT` with median/min/max latency, writes the plan next to the log). `scripts/benchmark/suite.ts` registers them; `benchmark:run` now builds the suite from `BENCH_DATABASE_URL`.
- **Executor additions** (B2 shell, backwards compatible): per-scenario `prepare` hook (isolated reset; failure fails that scenario without starting it), environment facts from `prepare()`, and extra evidence a scenario writes to `BENCH_ARTIFACT_DIR` (`*.plan.txt` as `QUERY_PLAN`, `*.jsonl` as `RAW_DATA`), sanitized and registered; Artifact file names now come from `src/domain/benchmark/artifact.ts`.

## Files Changed

- New: `bench/lib/{database,reset,preflight,validate,targets}.ts`, `bench/scenarios/{measure,t13-queries,t13-reads}.ts`, `src/domain/benchmark/artifact.ts`
- Modified: `scripts/benchmark/{executor,store,suite}.ts`, `scripts/benchmark-run.ts`, `bench/run.ts`, `package.json` (`bench:template`)
- New tests: `test/bench/{measure,database-guard,preflight,t13-queries}.spec.ts`, `test/domain/benchmark/artifact.spec.ts`, `test/scripts/{benchmark-extensions,benchmark-suite}.spec.ts`, `test/integration/benchmark-{reset,preflight,t13,suite-run}.spec.ts`, `test/support/bench-database.ts` (+ additions to `benchmark-suite.ts`)
- Docs: `TASKS.md`, `task-runs/B3-CONTEXT.md`, `task-runs/B3-summary.md`

## Tests Added or Updated

Unit: median and plan parsing, protocol with a controlled executor, guard refusals, environment failures, PostgreSQL unreachable, 33 query definitions (unique safe ids, distinct fingerprints, SQL hash, placeholder rendering and unsafe values), Artifact naming, executor prepare hook / environment facts / sanitized plan Artifacts, registry protocol. Integration (Testcontainers, small dataset, isolated server): template digest, identical restore twice, isolation after mutation, closing blocking connections, an older template migrated to the current schema, preflight success and determinism, missing template, invariant gate (bypassed triggers), digest drift, all 33 queries executing with normalized metrics and plans, and a reduced real Run (2 scenarios as ts-node child processes) publishing COMPLETED with plans.

## Commands Run

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:integration` (full suite), plus targeted `pnpm exec vitest run` per slice (RED then GREEN).

## Validation Result

`pnpm test`: 40 files, 255 tests passed. `pnpm test:integration`: 14 files, 121 tests passed (includes the new Testcontainers specs). `pnpm typecheck`, `pnpm lint`, `pnpm build` clean. The real `paylab-postgres-bench` container stayed untouched and healthy.

## Decisions Made

- Reset restores a template and then migrates: schema and index changes are the change under test, so they are deliberately not part of the dataset fingerprint (the data digest).
- Targets are discovered from the data (deterministic per seed) instead of the hardcoded ids in the old `suite.py`; ranges anchor on the first Wallet-to-Wallet transfer (funding Payments are a day earlier). Native T13 numbers are therefore comparable in method, not byte-identical, with the imported ones.
- Positions deeper than the rows that exist are capped so small datasets run; the requested depth stays in the config.
- No separate Docker preflight: an unreachable PostgreSQL is reported with the `pnpm bench:up` hint.
- Environment, PostgreSQL, and template checks run before a Run is opened (no published Run for an unprepared machine); restore, migration, and data gates run inside the Run and make it INCOMPLETE.
- The database name guard keeps the "contains bench" rule and adds a local-host requirement, plain identifiers, and refusal of the development/test database.

## Follow-up Needed

- One-time setup on the developer's machine: `pnpm bench:template` (or `BENCH_TEMPLATE_DATABASE=paylab_bench_adopted` to reuse the existing template; it has no recorded digest, so the drift check is skipped for it).
- `benchmark:run` restores `paylab_bench` on every Run, destroying its current contents (by design); B8 documents this.
- Not yet covered: `PROJECT.md` / `docs/benchmark.md` updates (B8), the T14 group (B4), the `summaryRole` set for T13 headline metrics (none assigned; median latency has no role today).

## Context for Next Task

B4 registers the T14 group in `scripts/benchmark/suite.ts` after T13: use `ScenarioSpec.prepare` with `restoreBenchmarkDatabase(database)` for a deterministic reset before each cell/mutating group, print `BENCH_RESULT` metrics, and write raw JSONL samples to `BENCH_ARTIFACT_DIR/*.jsonl` (becomes `RAW_DATA`). `t13Scenarios()` is the pattern; correctness gates are scenarios that exit non-zero.
