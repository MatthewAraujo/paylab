# Frontend lane C — F4 (navigation, route frames, design-system pieces, shared states)

## Tasks (in order)

1. **F4** — Navigation, route frames, design-system pieces, and shared states. Spec: `../tasks/F4.md`.

## Path boundary

Modify or create only: `src/components/app-shell.tsx` and `src/components/app-shell.test.tsx`, `src/components/ui/badge.tsx`, NEW files under `src/components/benchmarks/**`, NEW route frames under `src/app/(console)/benchmarks/**` (overview `page.tsx`, `compare/page.tsx`, `trends/page.tsx`, `runs/[runId]/page.tsx`, plus a shared benchmarks layout if useful), `src/app/globals.css` (only for semantic tokens no existing token expresses), and `docs/benchmark-observability/task-runs/F4-*.md`. Shared pieces must take plain props (no dependency on the F2 client, which another lane is writing now); later lanes fill the frames. Other lanes work in `src/features/benchmarks/api/` (F2) and `src/features/benchmarks/rules/` (F3).

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

