# F5 summary — Overview of the latest Benchmark Run

Status: done. Tests first (24 rendered-component tests + the route test), then implementation.

## What changed

- `src/features/benchmarks/overview/`: `BenchmarkOverview` (client, F2 hooks under the root provider) with `LatestRun`, `HeadlineSection`, `DifferenceSection`, `BaselineSection`, `ScenarioGroups`, `RunHistory`, plus the pure `notable-changes.ts` and `headline-compare.ts`.
- `src/components/benchmarks/commit-reference.tsx` (abbreviated commit, reveal, copy) and `benchmark-section.tsx` (named region).
- `src/app/(console)/benchmarks/page.tsx` renders the overview inside `BenchmarkFrame`; its test now covers the route with the stub.
- `src/test/benchmark-fixtures-overview.ts`: composed fixtures and `serveOverview(stub, data)`.

## Decisions

- Latest Run = first item of the Run list, whatever its status. Only a COMPLETED latest Run gets headline, difference and Baseline sections; INCOMPLETE shows the list item's `failure` summary and a link to detail; RUNNING shows "still running" (F6 adds the panel).
- Light list items feed the headline cards, reference values and the Baseline indication. Full records are read only for the latest Run (groups, imported source) and the two Runs of the default comparison (notable changes).
- The default comparison is used only when its `current` is the latest Run and `current`, `reference` and `comparison` are all non-null (the API returns them nullable).
- Light headline items carry no direction, so it comes from the declared role (throughput higher is better; latency, error rate, duration lower).
- Notable changes: comparable scenarios only, beyond the 5% band, 5 improvements and 5 regressions max, largest first (a move away from zero ranks first), the rest counted.
- Comparison link: `/benchmarks/compare?current=<id>&reference=<id>`.

## Follow-ups

- F9 must accept the `current` and `reference` query parameters used above (or tell the orchestrator to adjust the link).
- The Run detail link is `/benchmarks/runs/<id>` (F7's route).

## Validation

`pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 (46 files, 296 tests), `pnpm build` 0.
