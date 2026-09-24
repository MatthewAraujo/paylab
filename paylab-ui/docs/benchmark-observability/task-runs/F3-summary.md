# F3 Summary

## Status

Done. Every rule is implemented test-first as pure TypeScript with no React, network, or DOM dependency, and validated with all four gates green.

## What Changed

New module `src/features/benchmarks/rules/` (import from `@/features/benchmarks/rules`), built on the generated schema types only:

- **`classify.ts`**: `classifyChange({ current, reference, direction }) => Change`, `STABLE_TOLERANCE_PERCENT` (5). `Change` is `{ kind: "compared"; classification: "improved" | "stable" | "regressed"; absoluteDelta: number; percentDelta: number | null }`, `{ kind: "informational"; absoluteDelta; percentDelta }` (neutral metrics: values, never classified), or `{ kind: "not-recorded" }` (one side missing, never zero). The Stable band is inclusive at exactly +-5% with a floating-point epsilon (1 to 1.05 is Stable).
- **`identity.ts`**: `metricIdentity(metric) => string` (`key` plus dimensions sorted by name, for example `tps|strategy=nokey`) and `dimensionLabel(metric) => string` (`strategy: nokey`, empty when none).
- **`comparison.ts`**: `pairMetrics(current?, reference?) => MetricRow[]` (`MetricRow`: `identity, key, label, unit, direction, dimensions?, current?, reference?, change`; current order first, then reference-only), `summarizeRows(rows) => MetricCounts` (`improved, stable, regressed, informational, notRecorded`), `compareScenario({ scenarioId, state, current?, reference? }) => ScenarioComparison` (rows only when `state === "comparable"`, otherwise `rows: []`, so no delta is ever computed across a change), and `summarizeComparison(comparisons) => ComparisonSummary` (`scenarios: { comparable, new, removed, changed, incompatible }` where `incompatible` is environment plus dataset, and `metrics: MetricCounts` over comparable scenarios only).
- **`headline.ts`**: `HEADLINE_ROLES` (`THROUGHPUT, LATENCY_P99, ERROR_RATE, DURATION`), `headlineScenarios(metrics) => { scenarioId, metrics }[]` (grouped in the Run's own order), `defaultHeadlineScenario(groups) => string | null` (the first scenario that declares highlights), `headlineByRole(metrics) => Partial<Record<SummaryRole, HeadlineMetric[]>>` (only declared roles are present, so an undeclared role can say "not declared").
- **`groups.ts`**: `groupTitle(group) => string` (T13 and T14 named, unknown groups titled from their id, empty is "Other"), `groupScenarios(scenarios) => ScenarioGroup[]` (`group, title, scenarios, counts { total, completed, failed, pending, active }`).
- **`format.ts`**: `NOT_RECORDED` ("Not recorded"), `formatNumber(value)` (thousands separators, up to 3 decimals, trailing zeros trimmed), `formatMetricValue(value | undefined, unit)`, `formatDelta(absoluteDelta, unit)` (signed, zero unsigned), `formatPercent(percent | null)` (one decimal, signed, "Not applicable" for null), `formatDuration(ms | undefined)` (`500 ms`, `12.4 s`, `78m 24s`), `formatInstant(iso)` (reuses the console's UTC `formatTimestamp`), `exactInstant(iso)` (normalized ISO), `abbreviateCommit(commit)` (7 characters; `unknown` unchanged), `compactId(value)` (long ids keep both ends, for example `2026-09-…bc1234`), `compactIds(values) => Map<string, string>` (grows both ends until every compact form is distinct, so two different ids never look identical).
- **`types.ts`**: `Metric`, `Scenario`, `HeadlineMetric`, `RunListItem`, `MetricDirection`, `SummaryRole`, `ComparisonState`, all aliases of the generated schema. **`index.ts`** re-exports everything.

## Files Changed

- New: `src/features/benchmarks/rules/{classify,identity,comparison,headline,groups,format,types,index}.ts` and their tests (`classify`, `identity`, `comparison`, `headline`, `groups`, `format`), `docs/benchmark-observability/task-runs/F3-CONTEXT.md`, `F3-summary.md`.
- No existing file was modified (`src/lib/datetime.ts` is only imported).

## Tests Added or Updated

80 tests in 6 specs, written failing first with independent literals: direction for higher and lower is better; exactly +5% and -5%, 1 to 1.05, and just past the band; neutral metrics reported but not classified; missing values as "not recorded"; reference zero (0 to 0 Stable with no percentage, 0 to 3 regressing for a lower-is-better metric, improving for a higher-is-better one); identity by key plus dimensions and independence from dimension order; pairing with one-sided and recorded-zero cases and strategies kept apart; summary counts; no rows for `changed`, `environment-incompatible`, `dataset-incompatible`, `new`, or `removed` scenarios; headline grouping and the deterministic default (independent of name and value); group titles, ordering, and status counts; every formatter, including missing values, zero, and identifier collisions.

## Commands Run

`pnpm exec vitest run src/features/benchmarks/rules/<file>` (RED then GREEN per slice), `pnpm exec biome check --write src/features/benchmarks/rules`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Validation Result

`pnpm lint` exit 0. `pnpm typecheck` exit 0. `pnpm test` exit 0 (31 files, 174 tests). `pnpm build` exit 0. The incidental `next-env.d.ts` rewrite caused by the build was reverted (outside this lane's boundary).

## Decisions Made

- **Zero reference** follows the approved design, not the API's pure `classifyChange` (which reports it as not comparable and is used by no endpoint): 0 to 0 is Stable with delta 0 and no percentage; a move away from zero is classified by direction with no percentage. The divergence is documented in the doc comment of `classifyChange` and pinned by tests, and is recorded as a follow-up to align the API function.
- `incompatible` in the comparison summary means environment or dataset incompatibility; `changed` (definition), `new`, and `removed` stay separate scenario counts, matching the design review.
- `compareScenario` computes rows only for a comparable scenario, so a caller cannot show a delta across a change by accident.
- A plain `count` unit is omitted next to the number ("3", not "3 count").
- `compactId` only shortens identifiers longer than 24 characters, so native Run ids compact while short ids do not.

## Follow-up Needed

- Align the API's unused pure `classifyChange` with the design's zero-reference rule (or remove it), so there is one definition on both sides.
- F5, F9, and F11 consume these functions; a component that needs a formatting variant should add it here rather than format inline.

## Context for Next Task

Import from `@/features/benchmarks/rules`. Use `metricIdentity` to pair metrics across Runs, `compareScenario` with the API's comparison state per scenario, and `summarizeComparison` for the Improved, Stable, Regressed, Incompatible, and Not recorded tiles. Show `formatMetricValue`, `formatDelta`, and `formatPercent` together with the classification text so no label stands without its numbers, and keep `exactInstant` and the full id available next to `formatInstant` and `compactId`.
