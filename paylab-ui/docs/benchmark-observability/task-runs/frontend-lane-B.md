# Frontend lane B — F3 (pure benchmark presentation rules)

## Tasks (in order)

1. **F3** — Pure benchmark presentation rules. Spec: `../tasks/F3.md`.

## Path boundary

Modify or create only: `src/features/benchmarks/rules/**` (pure modules and their unit tests, no React, network, or DOM) and `docs/benchmark-observability/task-runs/F3-*.md`. The rules operate on the generated schema types. Do not edit `src/lib/datetime.ts`, `src/lib/money.ts`, or any other existing file: if a helper you need lives there, wrap or reuse it from your new modules, and if it must change, stop and report. Other lanes work in `src/features/benchmarks/api/` (F2) and `src/components/**` plus `src/app/**` (F4).

## Sync points

None.

## Environment

You run in your own git worktree of this repository (created for you). Work only there: never cd to the original checkout. The worktree has no `node_modules`: first run `pnpm install --frozen-lockfile` inside its `paylab-ui/` directory. The untracked `PayLab-Benchmarks-source/` prototype is not in your worktree and must never be imported or recreated. Read `AGENTS.md` and, before writing any Next.js-specific code, the relevant guides in `node_modules/next/dist/docs/`.

## Prior state

F1 is done (see `F1-summary.md`): the OpenAPI snapshot and generated types in `src/api/generated/schema.d.ts` contain the `/v1/benchmarks/*` contract, and `currentCapabilities` exposes `benchmarks` and `benchmarkBaselineWrite`. Import types from `@/api/generated/schema`; never handwrite a benchmark type. A benchmark 404 without an error `code` means the capability is off; with `BENCHMARK_*` codes it means an unknown Run or Artifact. The PRD is `../PRD.md`; the task specs are `../tasks/F*.md`.

## Loop

For each task in order run `task-runner` in **lane mode**: build `task-runs/F<n>-CONTEXT.md`, hand off to `tdd` (failing test first, minimum code, refactor only when green), write `task-runs/F<n>-summary.md`, and make ONE atomic commit on your branch with explicit paths (never `git add -A`). Do not edit `docs/benchmark-observability/TASKS.md` (the orchestrator owns the index). Validate with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` (all must exit 0; report exit codes).

## Stop conditions

Execute the lane directly: do not spawn further subagents. Report when the list is finished or a task is `blocked` (never continue past `blocked`): status, commit sha and branch, validation exit codes, decisions, follow-ups, and anything the next lanes must know. If a task needs a file outside the path boundary, stop and report instead of editing it.

