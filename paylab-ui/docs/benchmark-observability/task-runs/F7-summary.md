# F7 summary — Run detail

Status: done. Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (46 files, 298 tests), `pnpm build` all exit 0.

## What was built

- `src/features/benchmarks/run-detail/`
  - `run-detail-view.tsx`: `RunDetailView({ runId, baseUrl?, baselineAction?, renderArtifactAction? })`, one `useRun` read, loading / unavailable / unreachable / not-found / malformed states, a refresh-failed notice that keeps the last data.
  - `run-identity.tsx`: status and provenance badges, Imported explanation with its evidence source, note, commit, branch (unknown shown as "not recorded"), UTC times, duration, executor and schema version, environment details, dataset fingerprint and description.
  - `scenario-groups.tsx`: `ScenarioGroups` groups by `group`; Runs above `EXPAND_ALL_UP_TO_METRICS` (100) open with groups and scenarios collapsed and mount no table until opened. Each scenario header shows id, protocol, status and metric count.
  - `metric-table.tsx`: `MetricTable` (reusable by F9) with label, dimensions, key, value and unit, direction in words, aggregation ("Not recorded" when absent); labelled, focusable scroll region with a sticky identity column. Unknown metrics render generically.
  - `failure-evidence.tsx`: `FailureEvidence` (scenario, command, exit status or "no exit status recorded", times, summary) and `DiagnosticMeasurements` ("cannot be compared or become the Baseline").
  - `artifact-inventory.tsx`: `ArtifactInventory` / `ArtifactRow` with kind, label, evidence file, scenario, size, availability; optional `renderAction` adds an Action column.
  - `run-shortcuts.tsx`: comparison links (previous compatible, Baseline), and the Baseline slot (`DisabledBaselineAction` unless `baselineAction` is given).
  - `protocol.ts`, `format-bytes.ts`, `types.ts`.
- `src/components/benchmarks/benchmark-failure-state.tsx`: `BenchmarkFailureState`, shared by F9.
- `src/test/benchmark-fixtures-detail.ts`: native, large, Incomplete and the three Imported fixtures.
- `runs/[runId]/page.tsx` renders `RunDetailView`; its test now stubs the API.

## Decisions

- Incomplete Runs show failure, diagnostic measurements, Artifacts in that order; no shortcuts, no Baseline action, and no Baseline request is made. A running Run shows no shortcuts either.
- Comparison links use `/benchmarks/compare?current=<id>[&reference=<id>]`; the default reference for a bare `current` is F9's job.
- The Baseline shortcut is offered only when another Run is the Baseline; when this Run is the Baseline it says so and hides the action.
- Malformed responses never degrade to "Not recorded"; they produce their own state.

## Follow-ups

- Wire the Artifact viewer through `renderArtifactAction`, and the Baseline selection through `baselineAction` (orchestrator).
- Tests were written before the implementation but the red run was not captured separately; the suite was green on first execution.
