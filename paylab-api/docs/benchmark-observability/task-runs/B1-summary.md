# B1 Summary

## Status

Done. All B1 rules are implemented test-first and validated.

## What Changed

New pure benchmark contract under `src/domain/benchmark/` with no Nest, Prisma, filesystem, or HTTP imports:

- `summary.ts` — Zod schema `parseSummary(input): Either<InvalidBenchmarkRecordError, BenchmarkSummary>`. Schema version 1 only; safe run identifiers; metrics list only existing values (absent stays absent); explicit `summaryRole` (`THROUGHPUT`, `LATENCY_P99`, `ERROR_RATE`, `DURATION`); lifecycle cross-rules (RUNNING has no `finishedAt`, terminal requires it, COMPLETED requires all scenarios COMPLETED, INCOMPLETE requires `failure`, `imported` provenance on and only on imported Runs). Exports `safeId`.
- `lifecycle.ts` — `canTransition`: only `RUNNING` to a terminal state.
- `canonical.ts` — `canonicalJson`, `fingerprint` (SHA-256), `scenarioFingerprint` over id, protocol, and config.
- `serialize.ts` — `serializeSummary`: sorted keys, 2-space indent, trailing newline.
- `performance-change.ts` — `classifyChange` with direction, absolute and percent delta, stable within exactly ±5% (float-safe), `not-comparable` for missing value or zero reference.
- `comparison.ts` — `compareRuns` (per-scenario `comparable`/`new`/`removed`/`changed`/`environment-incompatible`/`dataset-incompatible`, sorted by id, Left for non-COMPLETED Runs) and `selectDefaultComparison` (newest completed Run and the newest earlier completed Run sharing a comparable scenario).
- `baseline.ts` — `parseBaseline` and `isBaselineEligible` (COMPLETED only).

## Files Changed

- `src/domain/benchmark/{summary,lifecycle,canonical,serialize,performance-change,comparison,baseline}.ts`
- `test/domain/benchmark/{summary,lifecycle,canonical,performance-change,comparison,baseline}.spec.ts`
- `test/support/benchmark-fixtures.ts` (plain-object fixtures that do not import the contract)
- `docs/benchmark-observability/TASKS.md`, `task-runs/B1-CONTEXT.md`, `task-runs/B1-summary.md`

## Tests Added or Updated

45 new unit tests in 6 specs. The SHA-256 expectation was computed outside the code with `sha256sum`; delta and boundary values are hand-written literals.

## Commands Run

- `pnpm install --frozen-lockfile` (this worktree had no `node_modules`)
- `pnpm exec vitest run test/domain/benchmark` (RED then GREEN per slice)
- `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm exec biome check --write` on the new files only

## Validation Result

`pnpm test`: 28 files, 172 tests passed. `pnpm typecheck` and `pnpm lint` clean.

## Decisions Made

- The contract lives in `src/domain/benchmark/`, separate from `src/domain/paylab` (resolves the open question in the plan).
- Fixtures do not import the contract, so specs check it against independent literals.
- Zero reference is `not-comparable` (no percentage against zero), as specified in B1.
- A comparison partner must share at least one comparable scenario to count as "compatible" for the default pair.

## Follow-up Needed

- The summary-role enum is a minimal set derived from the PRD overview (TPS, p99, error rate, duration); B3/B4 may need to confirm it covers their headline metrics.
- The `RUNNING` progress detail beyond per-scenario status is not modeled yet; B2 decides what it needs.

## Context for Next Task

B2 should build on `parseSummary`/`serializeSummary`/`canTransition` for the executor and the versioned Summary write, and use `scenarioFingerprint` when registering scenarios. Import from `@/domain/benchmark/*`. Results are `Either` values from `@/core/either`.
