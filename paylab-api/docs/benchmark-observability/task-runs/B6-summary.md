# B6 Summary

## Status

Done. A development-only, typed, read-only benchmark API is in place and proven by e2e tests on real Summary and Artifact fixtures and on the repository's own imported evidence. No route starts, changes, or deletes a Run. Baseline selection (write and read) is B7.

## What Changed

- **Capability** (`BENCHMARK_ENABLED`, `BENCH_SUMMARY_DIR`, `BENCH_ARTIFACT_ROOT` in `env.ts`): on by default only when `NODE_ENV=development`, off in test and production, and the API refuses to boot with it enabled in production. A guard makes every route answer 404 (revealing nothing) when it is off. The surface uses no Merchant authentication and no benchmark database.
- **Routes under `/v1/benchmarks`** (all `GET`): `status`; `runs` (newest first, keyset cursor, `limit` and `status` filter, light items with headline metrics and a `skipped` list of unreadable records); `runs/:runId` (the complete record with every Artifact and whether its file exists, plus an `abandoned` flag); `runs/:runId/progress` (per-scenario status and the scenario running now); `runs/:runId/artifacts/:artifactId` (metadata), `.../content` (bounded chunks of whole lines, at most 256 KiB, with `nextOffset`) and `.../download` (streamed text attachment); `comparisons/default` (newest completed Run against the previous compatible one, per-scenario state); `comparisons?current&reference` (any two completed Runs; an incomplete Run gives 422 `BENCHMARK_RUN_NOT_COMPARABLE`); `trends?scenarioId&metric&dimension=key:value` (compatible completed points, exclusions with reasons, and incomplete Runs as markers without values).
- **Filesystem reader** (`src/infra/benchmark/benchmark-store.ts`): isolates a malformed or misnamed record instead of failing the history; a Run still running comes from its local state unless already published; liveness of the executor (lock plus process check) drives `activeRunId` and `abandoned`; a Run is found only by a validated identifier and an Artifact only through the references its own record lists (plus the live log of the scenario running now); every file must resolve, symlinks included, inside its directory (imported evidence: in place under `docs/experiments`).
- **Redaction defense**: text is sanitized again on read and on download (line by line, so a secret cannot straddle a chunk). The sanitizer and `collectSecrets` moved from `scripts/benchmark` into `src/domain/benchmark/sanitize.ts` so the API can reuse them.
- **Pure read models** (`src/domain/benchmark/read-models.ts`): the light list projection, progress, and the trend rule (compatible with the newest completed measurement; excluded with reason `changed`, `environment-incompatible`, `dataset-incompatible`, or `metric-not-recorded`).
- OpenAPI: documentation-only response classes for every route; `ApiBenchmarkRoute` decorator (no auth, optional 404 and 422). `buildTestApp` accepts provider overrides.

## Files Changed

- New: `src/infra/benchmark/{benchmark-store,benchmark.config,sanitizing-lines}.ts`, `src/infra/http/{benchmarks.module,benchmark-enabled.guard}.ts`, `src/infra/http/controllers/benchmarks.controller.ts`, `src/infra/http/openapi/benchmark-responses.ts`, `src/infra/http/pagination/run-cursor.ts`, `src/domain/benchmark/read-models.ts`
- Moved: `sanitize.ts` to `src/domain/benchmark/` (with its spec and `collectSecrets`)
- Modified: `src/infra/env/env.ts`, `src/infra/app.module.ts`, `src/infra/http/openapi/decorators.ts`, `scripts/benchmark/{cli,executor}.ts`, `scripts/benchmark-run.ts`, `.env.example`, existing env and CLI specs, `test/support/app.ts`
- New tests: `test/domain/benchmark/read-models.spec.ts`, `test/infra/benchmark/{benchmark-store,benchmark-config}.spec.ts`, `test/infra/env/benchmark-env.spec.ts`, `test/infra/http/pagination/run-cursor.spec.ts`, `test/e2e/benchmarks-{availability,runs,artifacts,comparisons,openapi,real-evidence}.e2e-spec.ts`, `test/support/{benchmark-app,openapi}.ts`
- Docs: `TASKS.md`, `task-runs/B6-CONTEXT.md`, `task-runs/B6-summary.md`

## Tests Added or Updated

- Pure: list projection, progress, trend (order, exclusions, incomplete markers, dimensions, unknown scenario). Filesystem: malformed and misnamed records, running versus published, liveness, containment and symlink escape, imported evidence in place, live log, bounded chunks, over-long lines, redaction on read and download. Env: production forced off and refused when enabled.
- E2E: off answers 404 on every route without leaking content; on needs no credential; no POST, PUT, PATCH, or DELETE exists; list order, cursor pages, status filter, bad parameters (422, never a clamp); detail, incomplete Run evidence, unknown Run (404) and unsafe identifiers (422); progress of an active Run, abandoned records, terminal Runs; Artifact metadata, missing file, only-listed Artifacts, path-like identifiers, symlink escape, bounded content, redaction, complete streamed download, live log, imported evidence; default pair, chosen comparison, blocked environments, refused incomplete Runs; trends with exclusions and markers.
- OpenAPI contract: every route documented, typed, without security; parameters declared; real responses (running, imported, incomplete, skipped records, nullable fields) and error bodies match their schemas.
- Real evidence: the API on the repository's `bench/results` lists the three imported Runs, returns the 17-scenario T14 record, serves `T14-load.jsonl` and the correctness record in place, draws the T13 trend (57.742 ms baseline to 0.108 ms adopted, both comparable) and a T14 trend by strategy, and shows no default reference for T14.

## Commands Run

`pnpm exec vitest run` per slice (RED then GREEN, unit and e2e configs), then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`, `pnpm test:integration`.

## Validation Result

`pnpm test`: 50 files, 363 tests passed. `pnpm test:e2e`: 16 files, 170 tests passed. `pnpm test:integration`: 15 files, 126 tests passed. `pnpm typecheck` and `pnpm build` clean. `pnpm lint` first flagged non-null assertions in the new store spec; they were replaced by helpers and lint is clean. The real `paylab-postgres-bench` container stayed untouched and healthy.

## Decisions Made

- The capability is enforced by a guard on the controller (404 when off) and by env validation, instead of conditionally registering the module: it stays testable per app instance and never reveals evidence.
- Liveness is decided from the executor's lock (owner process alive and Run id matching); a RUNNING record without a live owner is reported `abandoned` so the console stops polling it, and never counted as the active Run.
- Comparison compatibility follows `compareRuns` exactly; trends use the newest completed Run that has the scenario as the definition of the line, so imported points appear as excluded ("changed") once a native Run exists.
- The list carries only headline metrics; the complete record is the detail endpoint (about 555 KB for a T14 Run). A per-scenario filter can be added if the console needs it.
- Errors follow the existing conventions: `{ code, message }` for 404, the validation body for 422, cursor-only pagination that rejects unknown parameters.

## Follow-up Needed

- B7 adds the Baseline read and write endpoints (the trend and comparison responses do not include it yet).
- The console still has to regenerate its client from the new OpenAPI document (UI plan).
- Reading and parsing files on every request is fine for a local tool; add a cache keyed by modification time if the history grows large.
- `benchmark:run` blocks on uncommitted generated files; the API deliberately never touches Git, so B7 must report the pending state itself.

## Context for Next Task

B7 should extend `BenchmarkStore` with the Baseline reference (`bench/results/baseline.json` or similar, atomic write, validated with `parseBaseline` and `isBaselineEligible`) and add its endpoints to `BenchmarksController` behind the same guard, reusing `requireRun`. The pending Git change is best reported by comparing the working tree (the executor's `assertCleanWorktree` logic) from the API side without committing anything.
