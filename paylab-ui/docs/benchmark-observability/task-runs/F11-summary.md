# F11 Summary

Status: done.

## What changed

- `src/features/benchmarks/trends/model.ts`: `buildTimeline` (points, Incomplete Runs and exclusions in Run order), `lineSegments` (an exclusion ends a segment, an Incomplete Run does not), `valueExtent`, `directionLabel`, `exclusionLabel`.
- `selection.ts`: address contract (`scenario`, `metric`, repeated `dimension=key:value`), `parseSelection`, `selectionToQuery`, `metricsOf`, `dimensionsOf`, `dimensionLabel`, `resolveSelection` (defaults from the newest completed Run; an address value not among the options is kept).
- `trend-chart.tsx`: accessible SVG (title, description, labelled axes, keyboard-scrollable region, legend in words). Native = circle, Imported = square, Baseline = ring plus the word "Baseline", Incomplete = triangle, left out = cross. No charting dependency.
- `trend-table.tsx`: exact-value table (Run, Value, Commit, Time, Note) with every Run of the trend, Baseline/Imported/Incomplete badges as words, and "Left out: <reason>" rows.
- `trends-view.tsx`: `TrendsView({ baseUrl? })`, selectors (Scenario, Metric, Dimension) backed by `router.replace`, all edge states.
- `src/app/(console)/benchmarks/trends/page.tsx`: the `PendingView` is replaced by `TrendsView` inside a `Suspense`; page test updated.
- `src/test/benchmark-fixtures-trends.ts`: `denseTrend(count)`.
- Tests: 57 in the trends folders and route (model, selection, chart, table, view, page).

## Validation

lint 0, typecheck 0, test 0 (51 files, 342 tests), build 0.

## Decisions

- Scenario and metric choices come from the newest completed Run's detail; an address value that is not there stays selected and the API's answer is shown.
- Commit and note are not in the trend response, so they are joined from the Run list (all pages are read). A Run missing from the list shows "Not recorded".
- The x axis is Run order, not a date scale.
- A dimension select appears only when the metric has dimension variants; changing scenario or metric resets to the first variant.

## Follow-ups

- Overview "entry to trends" (F5) should link with `?scenario=&metric=&dimension=key:value`.
- `next-env.d.ts` is rewritten by `pnpm build`; reverted, not committed.
