# Frontend lane 4 — F10 (Baseline selection, plus the F8 wiring)

Runs alone, directly in the integration worktree (`/home/matthew/personal/paylab-benchmark-report/paylab-ui`, branch `feature/benchmark-report`), so the shared files of earlier tasks may be edited where this task needs it. No other lane is running.

## Tasks (in order)

1. **F8 wiring (part of F10's first commit or its own commit `feat(ui): open the artifact viewer from the run views`)** — pass `ArtifactViewerDialog` through `RunDetailView`'s `renderArtifactAction` for the Artifact inventory, and open it from the F6 active-Run panel's recent log (link/button to the full log; artifact id `<scenarioId>-log`). Check that overview links match the compare (`?current=&reference=`) and trends (`?scenario=&metric=&dimension=k:v`) routes.
2. **F10** — Baseline selection. Spec: `../tasks/F10.md`. `useSelectBaseline` PUT mutation on the F2 client; confirmation dialog on `src/components/ui/dialog.tsx` (names current and proposed Baseline, discloses the reviewable Git change, no commit/push, cancel restores focus); fill `baselineAction` in `RunDetailView` (replace `DisabledBaselineAction`), add an action slot in the Comparison (`RunSelectors`/`ComparisonView`), overview Baseline line, pending-change notice (bounded file list + total); "no change" when reselecting the current Baseline; failures keep the previous Baseline displayed; invalidate Baseline queries everywhere; action only for completed Runs and when capability `benchmarkBaselineWrite` is true; body carries only the Run id, no credential.

## Rules

Read `../PRD.md`, `../tasks/F10.md`, and the F2/F7/F8/F9 summaries in this directory first. Never call `fetch` directly (F2 client/hooks), never handwrite benchmark types, never import the untracked `PayLab-Benchmarks-source/` and NEVER run `git stash`, `git clean` or `git reset --hard`. Read `AGENTS.md` and the Next 16 docs before Next-specific code. One atomic commit per task with explicit paths (no `git add -A`); do not edit `TASKS.md` (orchestrator). `pnpm build` rewrites `next-env.d.ts`: revert it (`git checkout -- next-env.d.ts`) and keep it out of commits. Follow `task-runner` lane mode with `tdd` (failing test first; record the red run).

## Validation and stop

After each task run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (revert `next-env.d.ts` before typecheck) and report exit codes. Report per task: status, sha, decisions, follow-ups. Stop if blocked. Do not spawn subagents.
