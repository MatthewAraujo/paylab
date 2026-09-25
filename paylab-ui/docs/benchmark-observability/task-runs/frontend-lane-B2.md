# Frontend lane B (phase 3) — F7 then F9 (Run detail and comparison)

## Tasks (in order)

1. **F7** — Run detail. Spec: `../tasks/F7.md`.
2. **F9** — Benchmark Comparison. Spec: `../tasks/F9.md`.

## Path boundary

Modify or create only: `src/features/benchmarks/run-detail/**`, `src/features/benchmarks/comparison/**`, `src/app/(console)/benchmarks/runs/[runId]/page.tsx`, `src/app/(console)/benchmarks/compare/page.tsx` and their tests, `src/test/benchmark-fixtures-detail.ts`, new files in `src/components/benchmarks/`, and `docs/benchmark-observability/task-runs/F7-*.md`, `F9-*.md`. Another lane owns `overview/`, `active-run/`, `artifacts/`, `trends/` and the other route pages.

## Sync points

The Artifact viewer (F8) and the Baseline action (F10) come from other lanes. In F7 list the Artifact inventory with availability and leave a clearly disabled/absent action slot; in F9 leave the Baseline slot absent. The orchestrator wires both later. F9 reuses the F7 scenario and metric presentation from this same lane.

## Environment

You run in your own git worktree of this repository. That worktree may start from an old base (`main`): before anything else run `git reset --hard feature/benchmark-report` (safe: nothing is committed yet), then `pnpm install --frozen-lockfile` inside its `paylab-ui/` directory. Work only in your worktree: never cd to the original checkout. The untracked `PayLab-Benchmarks-source/` prototype is not available and must never be recreated or imported; the visual direction is `docs/BENCHMARKS-DESIGN-REVIEW.md` and `docs/BENCHMARKS-DESIGN-BRIEF.md`. Read `AGENTS.md` and, before Next.js-specific code, the relevant guides in `node_modules/next/dist/docs/`. `pnpm build` rewrites `next-env.d.ts`: revert it and keep it out of commits.

## Prior state (read these summaries first)

F1 to F4 are done: `task-runs/F1-summary.md` (contract and capability flags), `F2-summary.md` (typed client, failure taxonomy, TanStack Query hooks, `createBenchmarkApiStub`, typed fixtures in `src/test/benchmark-fixtures.ts`), `F3-summary.md` (pure rules in `@/features/benchmarks/rules`: `classifyChange`, `pairMetrics`, `compareScenario`, `summarizeComparison`, headline selection, grouping, formatting), `F4-summary.md` (navigation, the four route frames with `BenchmarkFrame`/`PendingView`, badges, `MetricValue`, `CopyableId`, shared states). Use those exports; never call `fetch` directly (use the F2 hooks under one `QueryClientProvider`), never handwrite a benchmark type, and follow the PRD (`../PRD.md`) and your task specs (`../tasks/F*.md`).

## Shared code is read-only

Do not edit files owned by earlier tasks (`src/api/**`, `src/features/benchmarks/api/**`, `src/features/benchmarks/rules/**`, existing files in `src/components/**`, `src/test/benchmark-fixtures.ts`, `src/test/benchmark-api-stub.ts`, `src/app/globals.css` unless your boundary says so). You MAY add NEW files: to `src/components/benchmarks/` with names specific to your feature, and your own fixture file `src/test/benchmark-fixtures-<lane>.ts` composing the base builders. If you need a change to a shared file, stop and report instead of editing it.

## Loop

For each task in order run `task-runner` in **lane mode**: build `task-runs/F<n>-CONTEXT.md`, hand off to `tdd` (failing test first, minimum code, refactor only when green), write `task-runs/F<n>-summary.md`, and make ONE atomic commit per task on your branch with explicit paths (never `git add -A`). Do not edit `docs/benchmark-observability/TASKS.md` (the orchestrator owns the index). After each task validate with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` (all exit 0; report exit codes).

## Stop conditions

Execute the lane directly: do not spawn further subagents. Report when the list is finished or a task is `blocked` (never continue past `blocked`): per task the status, commit sha, validation exit codes, decisions, follow-ups; plus the branch name, worktree path, and anything the next lane must know. If a task needs a file outside the path boundary, stop and report.

