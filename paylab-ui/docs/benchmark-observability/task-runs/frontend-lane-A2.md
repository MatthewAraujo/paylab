# Frontend lane A (phase 3) — F5 then F6 (overview and active Run)

## Tasks (in order)

1. **F5** — Overview of the latest Benchmark Run. Spec: `../tasks/F5.md`.
2. **F6** — Active Run: progress and recent log. Spec: `../tasks/F6.md`.

## Path boundary

Modify or create only: `src/features/benchmarks/overview/**`, `src/features/benchmarks/active-run/**`, `src/app/(console)/benchmarks/page.tsx` and its test (replace the `PendingView`), `src/test/benchmark-fixtures-overview.ts`, new files in `src/components/benchmarks/`, and `docs/benchmark-observability/task-runs/F5-*.md`, `F6-*.md`. Another lane owns `run-detail/`, `comparison/`, `artifacts/`, `trends/` and the other route pages.

## Sync points

The full log viewer is F8 (another lane). In F6 link to the Run detail and show the tail of the log as escaped text; do NOT build or import a viewer. The orchestrator wires the viewer into the active-Run panel later.

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

