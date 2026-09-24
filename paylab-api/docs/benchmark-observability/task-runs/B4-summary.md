# B4 Summary

## Status

Done. The T14 correctness gate and the full concurrency matrix are registered and proven on a small isolated database with a reduced matrix. The exact production protocol (10 s windows, 3 repetitions, about 90 minutes for the whole T14 group) was not run: it is manual validation in B8. The developer's real benchmark container was never touched.

## What Changed

- **Matrix** (`bench/scenarios/t14-matrix.ts`, pure): the accepted protocol (2 s warm-up, 10 s window, 3 repetitions, median), the 16 cells (shapes H/W/M by clients by commit mode, commit mode off first), the workload constants covered by the fingerprint, `strategyOrder` (Latin-square rotation), `aggregateRuns` (median and range per field), and `cellMetrics` (normalized metrics per strategy).
- **One scenario per cell, strategy as a metric dimension**: 16 scenarios (`t14.load.<shape>.c<clients>.sync-<mode>`), each carrying every strategy's metrics under `dimensions: { strategy }`. Metrics normalized from every driver field: throughput (with range), latency p50/p95/p99, retries, serialization failures, version conflicts, deadlocks, exhausted operations, errors, failed payments, lock acquisition mean/p95, lock waiters, PostgreSQL rollbacks and deadlocks, and sample counts. Credit and debit splits exist only for the mixed shape and are otherwise absent, not zero. Only the production strategy (`nokey`) carries the headline roles (throughput, p99).
- **Cell runner** (`bench/scenarios/t14-cell.ts`): each repetition restores the database from the template, then runs the five strategies in the rotated order on it, exactly as the accepted `run-matrix.sh` did; writes every driver line to `samples.jsonl` (raw data Artifact) and prints the metrics.
- **Correctness gate** (`bench/scenarios/t14-correctness.ts`, first T14 scenario, after an isolated reset): runs the T10 scenarios against every strategy. The recorded outcome is expected: four strategies pass and `FOR UPDATE` deadlocks on crossed transfers (ADR 0010). That one finding is tolerated for that one strategy; any other failure or invariant violation fails the gate and the Run becomes INCOMPLETE with the matrix skipped. Emits per-strategy violations, crossed-transfer deadlocks, and retries, plus `correctness.jsonl`.
- **Refactors, CLIs unchanged**: `bench/exp/strategies/load.ts` is now a thin CLI over `runLoadBlock` (`load-run.ts`), `correctness.ts` over `runCorrectness`, and `db.ts` resolves the database URL at call time; `run-matrix.sh` keeps working.
- **Contract additions** (additive, B1 files): optional metric `dimensions` and a `NEUTRAL` direction (informational counts such as sample sizes; `classifyChange` returns not-comparable "informational").
- `scripts/benchmark/suite.ts`: `t14Scenarios(database, options)`, registered after T13 in `buildSuite`.

## Files Changed

- New: `bench/scenarios/{t14-matrix,t14-cell,t14-correctness}.ts`, `bench/exp/strategies/load-run.ts`
- Modified: `bench/exp/strategies/{db,load,correctness}.ts`, `scripts/benchmark/suite.ts`, `src/domain/benchmark/{summary,performance-change}.ts`
- New tests: `test/bench/{t14-matrix,t14-correctness}.spec.ts`, `test/integration/benchmark-t14.spec.ts`; extended `test/scripts/benchmark-suite.spec.ts`, `test/integration/benchmark-suite-run.spec.ts`, `test/domain/benchmark/{summary,performance-change}.spec.ts`
- Docs: `TASKS.md`, `task-runs/B4-CONTEXT.md`, `task-runs/B4-summary.md`

## Tests Added or Updated

Pure, checked against the real recorded experiment: the rotation reproduces the order of all 48 recorded blocks; the aggregate of a published cell matches the summary table (H, sync on, 4 clients, nokey: 62.1, range 49.8 to 91.1); every driver field maps to a normalized metric; not-applicable fields stay absent; the gate accepts the recorded outcome and rejects a broken production strategy, an invariant violation, or any other `FOR UPDATE` failure. Integration (Testcontainers, small dataset): the correctness harness passes for strategies that hold and fails for a broken one; a load block reports every driver field and preserves the invariants; a reduced cell restores per repetition, follows the rotation, and yields per-strategy metrics; through the real executor a reduced T14 group publishes COMPLETED with raw samples, and a gate failing on a lock-free strategy leaves the Run INCOMPLETE with the matrix skipped.

## Commands Run

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:integration` (full suite), plus targeted `pnpm exec vitest run` per slice (RED then GREEN).

## Validation Result

`pnpm test`: 42 files, 283 tests passed. `pnpm test:integration`: 15 files, 126 tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean. The real `paylab-postgres-bench` container stayed untouched and healthy.

## Decisions Made

- One scenario per cell with the strategy as a metric dimension, instead of 80 scenarios: the rotation and the per-block reset need the five strategies to share a block, which a one-result-per-scenario process cannot express. Comparison and trends match metrics by key and dimensions.
- Cell-major execution (a cell's three repetitions back to back) instead of the old repetition-major sweep; block contents and per-block order are identical to the accepted protocol.
- The gate is not "all five pass": it encodes the recorded, documented outcome so a real regression fails while the known `FOR UPDATE` finding does not.
- `NEUTRAL` direction for sample counts, so they are shown but never classified as improved or regressed.
- The correctness scenarios need only fresh Wallets, but the gate still restores the database first (a mutating group gets isolated state).

## Follow-up Needed

- Size: a full Run's Summary now carries about 100 metrics per cell (about 1600 for T14); if the versioned file becomes unwieldy, B8 can compact metric serialization or drop redundant fields.
- Timing: the correctness gate took about 16 minutes on the full database in the original experiment, and the matrix about 75 minutes; the full T13 plus T14 Run is well over an hour and a half.
- `ERROR_RATE` and `DURATION` headline roles are not assigned for T14 (no single agreed measurement); revisit with the UI (B6+).
- `load.ts` and `correctness.ts` CLIs are unchanged in behavior by construction (the logic moved into functions the suite exercises); they were not run against the real database.

## Context for Next Task

The suite registry now covers T13 and T14. B5 (importer) only needs B1; it can reuse `T14_CELLS` ids and the metric mapping (`cellMetrics`, keys, `dimensions`) so imported T14 Runs line up with native scenarios and compare where compatible (fingerprints will differ because imported Runs cannot claim the native workload definition). B6 must match metrics by key plus `dimensions`, and treat `NEUTRAL` as informational.
