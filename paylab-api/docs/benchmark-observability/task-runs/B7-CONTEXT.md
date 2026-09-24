# B7 Context

## Task

Let a development-only API write select one eligible completed Run as the versioned Benchmark Baseline, without mutating any Run evidence, and expose the current Baseline and the pending Git state. Spec: `../tasks/B7.md`.

## Related PRD Acceptance Criteria

US-30 (a new Run is blocked while a generated Summary or Baseline change is uncommitted), 54..58 (one deliberate Baseline as a small versioned reference; selection from a completed native or imported Run; Summaries stay untouched; incomplete, running, and missing Runs are rejected; the response discloses the pending Git change), 67 (Baseline visible on trends), 65.

## Relevant Prior Summaries

`task-runs/B6-summary.md`: `BenchmarksController` behind `BenchmarkEnabledGuard`, `BenchmarkStore` (loads Runs, `requireRun`), `BENCHMARK_CONFIG` paths, e2e fixture `buildBenchmarkApp`, error conventions (`{code,message}` 404, validation 422). `task-runs/B2-summary.md`: `assertCleanWorktree` blocks the next Run while anything is uncommitted; atomic file writes. `task-runs/B1-summary.md`: `parseBaseline`, `isBaselineEligible`, `serializeSummary` canonical JSON.

## Files Likely Affected

- `src/infra/env/env.ts` (`BENCH_BASELINE_FILE`), `.env.example`, `biome.json` (generated file ignored), `src/infra/benchmark/{benchmark.config,benchmark-store}.ts`, new `src/infra/benchmark/git-status.ts`.
- `src/infra/http/controllers/benchmarks.controller.ts`, `src/infra/http/openapi/benchmark-responses.ts` (Baseline routes, `baselineRunId` on trends).
- Tests: store and Git spec on a temporary repository, e2e for the Baseline routes and the OpenAPI contract, an executor-block spec.

## Test-First Plan

Select a completed native and an imported Run; reject running, incomplete, and unknown candidates and a bad body; Summaries byte-identical after selection; the pointer is replaced atomically and only the pointer changes; selecting the current Baseline again writes nothing; the response reports the pending Git change and the next executor invocation is blocked until it is committed; the route exists only when the capability is on; the Baseline shows on trends.

## Constraints

- The API never commits, stages, or otherwise touches Git history; it only reads the working-tree status.
- One pointer file, versioned in Git (`bench/baseline.json`), never inside `bench/results` (where every file is a Summary).
- Baseline eligibility and lineage use the B1 rules (`isBaselineEligible`, `compareRuns`); comparisons against the Baseline reuse the existing comparison route with its run id.
- Do not edit the PRD or task files; the real benchmark container stays untouched.

## Risks

- The Git report covers the whole worktree (that is what blocks the next Run), so unrelated dirty files show up too; they are listed, bounded, and counted.
- A Baseline pointing at a Run that is no longer published is reported as such, not treated as an error.

## Definition of Done

The API persists, reads, replaces, and discloses a reviewable Baseline pointer while Runs stay immutable; `pnpm test`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green; one commit with code, tests, this file, the summary, and the index update.
