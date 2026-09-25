# F9 context pack (lane B, phase 3)

- Goal: Comparison route: choose two completed Runs (previous compatible by default, the
  Baseline, or another Run) through the query string, read compatibility from the API, and show
  per-scenario states and per-metric values, deltas and direction-aware classifications with
  distinct summary counts.
- Read: PRD.md (US-59..75), tasks/F9.md, F2/F3/F4 summaries, F7 code (`run-detail/`),
  `rules/{comparison,classify,format,groups}.ts`, the comparison endpoints in
  `api/benchmark-api.ts`.
- Boundaries: `features/benchmarks/comparison/**`, `run-detail/scenario-groups.tsx` (export
  `Disclosure`, same lane), `app/(console)/benchmarks/compare/page.*`,
  `test/benchmark-fixtures-detail.ts`, new files in `components/benchmarks/`, this file and
  `F9-summary.md`. `TASKS.md` and shared F2/F3/F4 files are untouched.
- Constraints: compatibility comes from the API, numbers and classification from the two Run
  records via the F3 rules; a non-comparable scenario shows no numeric delta and says why;
  missing values are "Not recorded"; classification by text plus shape; groups collapsed for
  large comparisons; tables in labelled focusable scroll regions; no execution controls.
- Design point: with only `current` in the address (F7 shortcut) the default reference is the
  most recent earlier completed Run with at least one comparable scenario, found by asking the
  API for up to 10 candidate comparisons.
- Sync point: the Baseline action slot stays absent here; the "use the Baseline" selector only
  reads the Baseline.
