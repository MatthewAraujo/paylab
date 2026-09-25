# F11 Context

## Task

Historical trends route: choose a scenario, metric and optional dimension and read that metric's history across compatible completed Runs, with exact values in a table, the Baseline marked, Incomplete Runs as markers, and excluded Runs listed with reasons. Replaces the `PendingView` of `/benchmarks/trends`. Spec: `../tasks/F11.md`.

## Related PRD Acceptance Criteria

US-83 (scenario and metric choice), US-84 (unit and direction stated), US-85 (Baseline marked), US-86 (Incomplete markers, exclusions with reasons), US-87 (never join across a change), US-88 (exact-value table: run, value, commit, time, note), US-89 (one point, no points, dense history, imported), US-90 (selection kept in the address).

## Relevant Prior Summaries

F2: `useTrend`, `useRuns`, `useRun`, `fetchTrend` (dimension as repeated `key:value`), failure taxonomy, `createBenchmarkApiStub`, fixtures `trend`, `runListItem`, `runDetail`, `scenario`, `metric`. F3: `format.ts` (`formatMetricValue`, `formatInstant`, `abbreviateCommit`, `compactIds`, `NOT_RECORDED`). F4: `BenchmarkFrame`, states, badges, `CopyableId`.

## Design decisions

- Scenarios and metrics offered come from the newest completed Run's detail (the trend line follows its definition). The URL selection wins when present, so a shared link still works for something not in that Run.
- Commit and note are not in the trend response; they are joined from the Run list by Run id. A Run not found in the list shows "Not recorded".
- The x axis is Run order (merged timeline of points, Incomplete markers and exclusions sorted by start time), never a date scale.
- Exclusions break the line; Incomplete markers do not (they carry no value and no definition change).
- No charting dependency: SVG with a text title and description, plus the table as the complete alternative. Native vs imported vs Baseline are separate shapes, not colors.

## Files Likely Affected

New: `src/features/benchmarks/trends/**` (model, selection, chart, table, view, tests), `src/test/benchmark-fixtures-trends.ts`. Edited: `src/app/(console)/benchmarks/trends/page.tsx` and its test. Nothing else; `TASKS.md` is not touched.

## Test-First Plan

Pure model tests (timeline order, segments, extent, labels, selection parse/serialize, options), chart and table component tests, route/view tests over the request stub with a mocked `next/navigation` (selectors read and write the address, edge states: one point, no points, unknown scenario, imported only, dense history, capability off, unreachable with retry).

## Definition of Done

A developer can inspect a metric's compatible history without color or pointer interaction; `pnpm lint`, `typecheck`, `test`, `build` exit 0; one atomic commit.
