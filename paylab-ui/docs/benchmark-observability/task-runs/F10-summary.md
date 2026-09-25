# F10 summary — Baseline selection (and the F8 wiring)

Status: done. Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (57 files, 455 tests), `pnpm build` all exit 0.

## F8 wiring (commit `10ba0ec`)

- Run detail: every available Artifact row has a "View" action (`ArtifactViewerDialog`; accessible name "View <label>"); a file missing on this machine shows a dash. `renderArtifactAction` still overrides.
- Active-Run panel: "Open full log" opens the viewer for `<current scenario>-log`.
- The overview's compare link already matches `?current=&reference=`. The overview has no trends link yet, so there was nothing to align there.

## What was built (F10)

- `src/features/benchmarks/baseline/baseline-action.tsx`: `BaselineAction({ runId, status, label?, enabled?, baseUrl? })`. Confirmation dialog naming the current and the proposed Baseline, saying the change is a reviewable Git change and that nothing is committed or pushed; no commit or push control exists. Outcome stays in the dialog: success ("The Baseline is now …" plus the Git notice), "No change" when the API reports `changed: false`, or an alert with the reason (ineligible, unknown Run, unreachable API) and "The Baseline is still …". Cancel changes nothing and Radix returns focus to the action. Not COMPLETED: disabled with an explanation. Capability off: explanation, no button. Hidden trigger when the Run already is the Baseline.
- `baseline-git-notice.tsx`: `BaselineGitNotice({ git })` from the API's `git` state (bounded list, total, "and N more", next benchmark run refuses to start). Shown in the dialog outcome and in the overview Baseline section, so it survives a reload.
- `RunShortcuts` renders `BaselineAction` by default (the disabled placeholder is gone); `RunDetailView` and `ComparisonView` take `baselineWrite` (default true), which the two pages pass from `currentCapabilities.benchmarkBaselineWrite` so the 66 KB OpenAPI snapshot stays out of the client bundle.
- `ComparisonView` offers "Make the current Run the Baseline" and "Make the reference Run the Baseline".
- The mutation refetches the Baseline, the default comparison and trends (F2 hook); the request body is only the Run id and carries no credential (asserted).

## Decisions / follow-ups

- Selection is offered from the Run detail and the comparison, not from the overview (the overview shows the Baseline and the pending Git change).
- When `baselineWrite` is false the comparison shows the "not available" line once per action.
- The cross-origin `PUT` (CORS) is verified only in the F12 browser smoke, as the spec says.
- Red run captured for `baseline-action.test.tsx` (module missing); the wiring tests were red before the change.
