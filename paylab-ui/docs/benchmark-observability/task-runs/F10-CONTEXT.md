# F10 context pack — Baseline selection

- Spec: `../tasks/F10.md`; PRD stories US-12, US-76..82.
- Inputs used: F2 (`useBaseline`, `useSelectBaseline`, `selectBaseline`), F7 (`RunShortcuts`, `baselineAction` slot), F8 (`ui/dialog.tsx`), F9 (`ComparisonView`), F1 capability `benchmarkBaselineWrite`.
- Contract: `PUT /v1/benchmarks/baseline` body `{ runId }`; answer `BaselineSelectionResponse` (`changed`, `git`); 422 `BENCHMARK_BASELINE_INELIGIBLE`, 404 `BENCHMARK_RUN_NOT_FOUND`.
- Sequence: first the F8 wiring (own commit `10ba0ec`), then the Baseline flow.
- Test-first: `baseline-action.test.tsx` was written before the component and failed on the missing module (red), then went green.
