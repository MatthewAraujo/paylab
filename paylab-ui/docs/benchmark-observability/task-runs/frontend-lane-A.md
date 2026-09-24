# Frontend lane A — F2 (typed client, failure taxonomy, test support)

## Tasks (in order)

1. **F2** — Typed benchmark client, failure taxonomy, and test support. Spec: `../tasks/F2.md`.

## Path boundary

Modify or create only: `src/features/benchmarks/api/**`, the NEW files `src/test/benchmark-fixtures.ts` and `src/test/benchmark-api-stub.ts` (plus their tests), and `docs/benchmark-observability/task-runs/F2-*.md`. Do not edit existing files in `src/test/`, `src/api/`, `src/lib/`, or components; other lanes work in `src/features/benchmarks/rules/` (F3) and `src/components/**` plus `src/app/**` (F4). Reuse `getApiBaseUrl` from `src/lib/env.ts` without changing it.

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

