# F3 Context

## Task

Pure presentation rules for the Benchmarks area, independent of React, network, and DOM: Performance Change classification with the inclusive 5% Stable band, raw deltas, metric identity (key plus dimensions), comparison rows and summary counts, headline selection from declared summary roles, scenario grouping, and formatting (numbers with units, durations, UTC timestamps, identifier compaction). Spec: `../tasks/F3.md`.

## Related PRD Acceptance Criteria

US-10 (compact identifiers with the full value available), US-13/14/15 (declared headline measurements grouped by scenario, deterministic default), US-17 (units and precision), US-40 (missing values never zero), US-41 (grouping), US-65..74 (states, deltas, classification, counts, zero reference, informational metrics), US-96.

## Relevant Prior Summaries

`F1-summary.md`: the generated types in `@/api/generated/schema` are the only source of benchmark shapes (`MetricResponse`, `ScenarioResponse`, `RunListItemResponse`, `HeadlineMetricResponse`, `ScenarioComparisonResponse`).

## Files Likely Affected

New pure modules and unit tests under `src/features/benchmarks/rules/`. Reuse `formatTimestamp` from `src/lib/datetime.ts` (UTC convention) without editing it.

## Test-First Plan

Independent literals, failing first, one behavior at a time: classification (direction, exact ±5% including 1 to 1.05, just past the band, neutral unclassified, missing sides, zero reference), metric identity, pairing and counts, headline selection and grouping, formatting.

## Constraints

- Path boundary: only `src/features/benchmarks/rules/**` and `docs/benchmark-observability/task-runs/F3-*.md`; no edits to `src/lib/*` or any existing file; never edit `docs/benchmark-observability/TASKS.md`.
- The zero-reference rule follows the approved design (0 to 0 is Stable, a change away from zero is classified by direction, no percentage) and deliberately differs from the API's unused pure `classifyChange` (not comparable); document it in the module.
- A missing value is never zero; never compute a delta across incompatible scenarios.
- Repo style: Biome (double quotes, semicolons).

## Risks

- Drift from the API's boundary cases (shared literals mitigate it). Identifier compaction colliding two different ids (a uniqueness-safe helper mitigates it).

## Definition of Done

Every rule covered by unit tests with no React, network, or DOM dependency; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass; one atomic commit with code, tests, this file, and the summary.
