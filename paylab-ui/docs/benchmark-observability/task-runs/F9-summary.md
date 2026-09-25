# F9 summary — Benchmark Comparison

Status: done. Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (47 files, 321 tests), `pnpm build` all exit 0.

## What was built

- `src/features/benchmarks/comparison/`
  - `use-comparison-data.ts`: resolves the address. Both `current` and `reference`: that pair. Neither: the API default. Only `current`: the most recent earlier completed Run (up to 10 asked, newest first) with at least one comparable scenario; none found gives "No reference Run to compare with".
  - `run-selectors.tsx`: "Current Run" and "Reference Run" selects (only completed Runs enabled; others listed as "unavailable (STATUS)"), Swap, and "Use the Baseline as reference" (reads the Baseline only). Every choice is `router.push(compareHref(...))`; `compareHref` is exported.
  - `comparison-body.tsx`: Compatibility (environment and dataset, stated first), Summary tiles (Improved, Stable, Regressed, Incompatible, Not recorded, plus the ±5% explanation and scenario-state counts), Scenarios grouped and collapsed above 100 rows. Every scenario shows its state badge; non-comparable ones show a reason and no numbers.
  - `comparison-table.tsx`: `ComparisonTable` with current, reference, absolute delta, percentage and a textual classification; informational metrics unclassified; one-sided metrics "Not recorded"; labelled, focusable scroll region with sticky metric identity.
  - `comparison-view.tsx`: `ComparisonView({ current?, reference?, baseUrl? })` with loading, not-found, refused (422 message), unavailable, unreachable and no-reference states.
- `compare/page.tsx` reads `searchParams` (async, first value of an array) and renders `ComparisonView`.
- `run-detail/scenario-groups.tsx` now exports `Disclosure` (same lane).
- `test/benchmark-fixtures-detail.ts`: `comparisonFixture()` covering all scenario states and metric cases.

## Decisions

- Numbers and classifications come from the two `useRun` records with the F3 rules; the API supplies only compatibility.
- Counts: Incompatible counts environment/dataset-incompatible scenarios; Not recorded counts one-sided metrics (both directions).
- No Baseline action exists in the comparison view; the slot for the orchestrator is the selector row in `run-selectors.tsx` (`RunSelectors`) if a Baseline action is wanted there.
- Imported versus native comparisons show a note that differences are evidence, not errors.

## Follow-ups

- The previous-compatible search issues up to 10 comparison requests sequentially; if the API later offers it directly, replace `use-comparison-data.ts`.
- Tests were written before the implementation; the red run was not captured separately.
