# B4 Context

## Task

Register the T14 correctness gate and load matrix in the suite: structured progress, the accepted protocol, normalized throughput/latency/contention metrics, isolated resets. Spec: `../tasks/B4.md`.

## Related PRD Acceptance Criteria

US-9 (isolation by reset), US-17/19 (gates make a Run INCOMPLETE), US-36 (2 s warm-up, 10 s window, 3 repetitions, median and range, Latin-square order), US-37/38, US-44 (every T14 measurement available), US-65.

## Relevant Prior Summaries

`task-runs/B3-summary.md`: `scripts/benchmark/suite.ts` registers groups (`t13Scenarios`); `restoreBenchmarkDatabase(database)` is the deterministic reset; scenarios are processes printing `BENCH_RESULT`; extra evidence goes to `BENCH_ARTIFACT_DIR` (`*.jsonl` becomes `RAW_DATA`); `ScenarioSpec.prepare` runs an isolated reset before a scenario. `task-runs/B1-summary.md`: contract and `classifyChange`.

## Files Likely Affected

- `bench/exp/strategies/{db,load,correctness}.ts` refactored into callable functions (CLI wrappers and `run-matrix.sh` keep working); new `bench/scenarios/{t14-matrix,t14-cell,t14-correctness}.ts`; `scripts/benchmark/suite.ts`.
- Additive contract change: optional metric `dimensions` (the strategy) and a `NEUTRAL` direction for informational counts, in `src/domain/benchmark/{summary,performance-change}.ts`.
- Tests: pure specs (rotation, aggregation, metric mapping, checked against the real T14 raw file and summary tables), integration specs (Testcontainers, small dataset, reduced matrix).

## Test-First Plan

Pure: Latin-square order equals the order of all 48 blocks in `docs/experiments/raw/T14-load.jsonl`; median and range of a real cell equal the published table (H, sync on, 4 clients, nokey: tps 62.1, range 49.8 to 91.1); every JSONL field maps to a normalized metric; not-applicable fields (credit outside shape M) stay absent. Integration: reduced load block (1 client group, 1 s window, 1 repetition) returns every field and preserves ledger invariants; correctness harness passes on the five strategies and fails when a strategy is broken; a reduced real Run publishes the gate plus one cell with per-strategy metrics and raw JSONL.

## Constraints

- NEVER touch the developer's real benchmark container; tests use Testcontainers only. No real `benchmark:run`.
- Keep the accepted production protocol in the registered definitions; automation only uses a reduced definition (different fingerprint, honestly).
- Preserve `run-matrix.sh` behavior and the experiment CLIs; do not edit the PRD or task files.

## Risks

- Scenario per cell (16), strategy carried as a metric dimension: a Run's Summary is large (about 100 metrics per cell); acceptable now, revisit compaction in B8.
- Cell-major execution order (3 repetitions of a cell back to back) differs from the old rep-major sweep; block contents and per-block strategy order are identical.
- A full cell takes about 5 minutes (3 blocks of restore plus 5 strategies), so the full matrix is about 75 to 90 minutes: manual validation only.

## Definition of Done

Registry covers T13 and T14; reduced automated run proves orchestration, gates, isolation, and metric mapping; `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green; one commit with code, tests, this file, the summary, and the index update.
