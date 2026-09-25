# F7 context pack (lane B, phase 3)

- Goal: Run detail route for native, Imported and Incomplete Runs: identity and provenance,
  environment, dataset, executor, protocols, scenarios grouped and lazily disclosed, normalized
  metrics, failure evidence, diagnostic measurements, Artifact inventory, comparison shortcuts,
  and the Baseline slot.
- Read: PRD.md (US-35..51), tasks/F7.md, F1..F4 summaries, `docs/BENCHMARKS-DESIGN-REVIEW.md`,
  `features/benchmarks/api/{hooks,results}.ts`, `features/benchmarks/rules/*`,
  `test/{benchmark-fixtures,benchmark-api-stub}.ts`, `components/benchmarks/*`, Next 16 async
  `params` in the route.
- Boundaries: `features/benchmarks/run-detail/**`, `app/(console)/benchmarks/runs/[runId]/page.*`,
  `test/benchmark-fixtures-detail.ts`, new files in `components/benchmarks/`, this file and
  `F7-summary.md`. `TASKS.md` and shared F2/F3/F4 files are untouched.
- Constraints: one `useRun` read under the root `QueryClientProvider`; no direct fetch; missing
  values are "Not recorded", never zero; native malformed records are a malformed state; groups
  and scenarios collapse for large Runs (rows are not mounted until expanded); tables scroll in
  labelled, focusable regions; meaning by text plus shape; UTC times; no execution controls.
- Sync points: Artifact viewer (F8) and Baseline action (F10) are wired by the orchestrator
  through `renderAction` (Artifact rows) and `baselineAction` (detail header); both absent here.
