# F5 context pack — Overview of the latest Benchmark Run

Spec: `../tasks/F5.md`. Stories: US-9..24, US-32..34. Lane A2 (worktree branch), path boundary in `frontend-lane-A2.md`.

## Inputs read

- PRD overview rules; `BENCHMARKS-DESIGN-REVIEW.md` (no composite score, headline cards only from declared roles, scenario context, Baseline is a reference not a target).
- F2: hooks `useRuns` (infinite, cursor), `useRun`, `useDefaultComparison`, `useBaseline`; failure taxonomy (`BenchmarkRequestError.failure`); stub + typed fixtures.
- F3: rules `headlineScenarios`, `defaultHeadlineScenario`, `headlineByRole`, `pairMetrics`, `compareScenario`, `summarizeComparison`, `groupScenarios`, formatters.
- F4: `BenchmarkFrame`, badges, `MetricValue`, `CopyableId`, shared states.

## Decisions taken before coding

- The route stays a server component (frame + capability check); a client component `BenchmarkOverview` reads through the F2 hooks under the root `QueryClientProvider`.
- Latest Run = first item of `useRuns` (newest whatever the status). Light list items feed headline cards, the reference values and the Baseline indication; full detail is fetched only for the latest Run (groups, failure) and the two Runs of the default comparison (notable changes).
- The default comparison is shown only when its `current` is the latest Run; otherwise (incomplete or running latest) there is nothing to classify.
- A RUNNING latest Run renders identity and a region that F6 fills with the active-Run panel.
- Notable changes: comparable scenarios only, outside the 5% band, at most 5 improvements and 5 regressions, largest first; the remainder is counted and links to the comparison.
- Links: `/benchmarks/runs/<id>`, `/benchmarks/compare?current=<id>&reference=<id>`, `/benchmarks/trends` (the comparison query parameter names are a hand-off to F9).

## Test seam

`BenchmarkOverview` rendered under a `QueryClientProvider` with `createBenchmarkApiStub().install()` and the composed fixtures in `src/test/benchmark-fixtures-overview.ts`; the route test covers the frame.
