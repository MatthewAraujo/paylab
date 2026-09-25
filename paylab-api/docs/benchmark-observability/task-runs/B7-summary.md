# B7 Summary

## Status

Done. The API can persist, read, replace, and disclose a reviewable Baseline pointer while Runs stay immutable and nothing is ever committed. Selection exists only when the benchmark capability is on.

## What Changed

- **Pointer**: one small deterministic file, `bench/baseline.json` (`BENCH_BASELINE_FILE`), kept outside `bench/results` (where every file is a Run) and versioned in Git. It holds the schema version, the Baseline Run id, and when it was selected. It is written to a temporary file and renamed into place, so a reader never sees a partial pointer. Selecting the Run that already is the Baseline writes nothing.
- **Routes** (same guard as the rest: 404 when the capability is off):
  - `GET /v1/benchmarks/baseline` returns the pointer, the Baseline Run as a list item (null when none is selected or the Run is no longer published), a `problem` when an existing file is damaged, and the pending Git state.
  - `PUT /v1/benchmarks/baseline` with `{ runId }` selects a Run and returns the same view plus `changed`. Unknown Run gives 404 `BENCHMARK_RUN_NOT_FOUND`; a running or incomplete Run gives 422 `BENCHMARK_BASELINE_INELIGIBLE`; a malformed body or a path-like id gives 422. Native and imported completed Runs are accepted. Rejections leave the Baseline as it was.
- **Pending Git change** (`src/infra/benchmark/git-status.ts`, read-only): whether the pointer differs from what is committed, the uncommitted files (at most 20) and their total count, or "unavailable" outside a repository. It reports the same worktree state that makes `benchmark:run` refuse to start; the API never stages or commits anything.
- **Trends** now carry `baselineRunId`, so the console can mark the Baseline on a line. Comparing against the Baseline reuses the existing comparison route with its run id.
- OpenAPI: response and request classes for the new routes (`SelectBaselineRequest`, `BaselineResponse`, `BaselineSelectionResponse`, `GitStateResponse`); biome ignores the generated pointer.

## Files Changed

- New: `src/infra/benchmark/git-status.ts`
- Modified: `src/infra/benchmark/{benchmark-store,benchmark.config}.ts`, `src/infra/env/env.ts`, `src/infra/http/controllers/benchmarks.controller.ts`, `src/infra/http/openapi/benchmark-responses.ts`, `.env.example`, `biome.json`
- New tests: `test/infra/benchmark/benchmark-baseline.spec.ts`, `test/e2e/benchmarks-baseline.e2e-spec.ts`; extended `test/e2e/benchmarks-openapi.e2e-spec.ts`, env and config specs, `test/support/benchmark-app.ts` (optional real Git repository)
- Docs: `TASKS.md`, `task-runs/B7-CONTEXT.md`, `task-runs/B7-summary.md`

## Tests Added or Updated

On a real temporary Git repository: the pointer is absent, deterministic, replaced cleanly, unchanged when re-selected, damaged-file tolerant, and refuses a path-like id; published Summaries stay byte-identical; the Baseline change shows as pending, nothing is staged or committed, and it clears after the developer commits; other pending files are listed (bounded) and counted; outside a repository the state is "unavailable"; and the executor's clean-worktree check refuses the next Run until the change is committed. E2E: select a completed native and an imported Run, the disclosed Git state, no rewrite on re-selection, replacement, rejection of running, incomplete, unknown, and malformed candidates with the Baseline unchanged, a Baseline whose Run vanished, a damaged pointer, the Baseline on trends, and the whole surface unavailable (404, no file written) when the capability is off. OpenAPI contract: the routes, the request body, the errors, and real responses match their schemas.

## Commands Run

`pnpm exec vitest run` per slice (RED then GREEN, unit and e2e configs), then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`, `pnpm test:integration`.

## Validation Result

`pnpm test`: 51 files, 376 tests passed. `pnpm test:e2e`: 17 files, 186 tests passed. `pnpm test:integration`: 15 files, 126 tests passed. `pnpm typecheck`, `pnpm lint`, and `pnpm build` clean. The real `paylab-postgres-bench` container stayed untouched and healthy.

## Decisions Made

- A single pointer, replaced on selection: the Baseline contract from B1 is one Run. "Lineage" is enforced where it matters, at comparison time (`compareRuns` reports environment, dataset, and scenario compatibility), so a Baseline from another environment simply shows as incompatible rather than being refused.
- `PUT` (an idempotent replace of the single pointer) rather than `POST`: it creates no resource and starts nothing; the only write in the whole surface is this pointer file.
- The Git report covers the whole worktree, not only the pointer, because that is what blocks the next Run; unrelated dirty files are visible but bounded.
- A pointer to a Run that is no longer published is shown as such (run null), not treated as an error.

## Follow-up Needed

- The console needs a confirmation step before `PUT` (UI plan) and should surface `git.dirtyCount` as the warning that the next Run is blocked until the change is committed.
- If the versioned Summary size becomes a concern (see the B5 follow-up), that decision is still open for B8.

## Context for Next Task

B8 validates everything end to end and documents operation: `pnpm benchmark:template`, `pnpm benchmark:run`, `pnpm benchmark:import`, the environment variables (`BENCH_*`, `BENCHMARK_ENABLED`), the storage layout (`bench/results`, `bench/baseline.json`, `.benchmark/`), and the read API. It also owns the first native full Run, which is a manual step on the developer's machine (long-running, destructive to `paylab_bench`, and never run by the agent without an explicit go-ahead).
