# Frontend lane 1 — F1 (contract refresh and capability)

You are a lane subagent. Execute this lane directly: do not spawn further subagents and work in your lane only.

## Tasks (in order)

1. **F1** — Refresh the contract and derive the Benchmarks capability. Spec: `../tasks/F1.md`.

## Working directory

`/home/matthew/personal/paylab-benchmark-report/paylab-ui` (the shared worktree; you are the only lane running now).

## Path boundary

Modify only:

- `openapi/paylab.json`, `src/api/generated/schema.d.ts`
- `src/api/capabilities.ts`, `src/api/capabilities.test.ts`, `src/api/current-capabilities.ts` (and any test that asserts the capabilities object)
- `docs/benchmark-observability/task-runs/F1-CONTEXT.md` and `F1-summary.md`

Do NOT edit `docs/benchmark-observability/TASKS.md` (the orchestrator owns the index), the PRD or task files, the `PayLab-Benchmarks-source/` directory (untracked, the user's prototype), or anything under `paylab-api/`. If the task needs a file outside this list, stop and report.

## Preconditions handled by the orchestrator

The PayLab API is already running at `http://localhost:3333` (started by the orchestrator, connected to the developer's development database) and its `/docs-json` already lists 11 `/v1/benchmarks/*` paths. Do not start or stop it. Run `pnpm sync:api` from `paylab-ui` (it fetches `/docs-json`, then regenerates the types).

## Loop

For each task in order run `task-runner` in **lane mode**: build `task-runs/F1-CONTEXT.md`, hand off to `tdd` (failing capability tests first, then the refresh), write `task-runs/F1-summary.md`, and make ONE atomic commit containing only F1's code, tests, context, and summary. Stage explicit paths (never `git add -A`); use `git commit -m ... -- <paths>` semantics so nothing else is swept in. Read `AGENTS.md`: read the bundled Next.js guides in `node_modules/next/dist/docs/` before touching anything Next-specific (F1 should not need to).

Follow the spec's test-first plan: capability tests with and without benchmark routes, a route without a typed JSON response reported unavailable, a separate flag for the Baseline write, and a test that the generated schema contains the benchmark paths so a stale snapshot fails. Validate with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Sync points

None inside this lane.

## Stop conditions

Report when F1 is done (status, commit sha, validation results, decisions, follow-ups) or when it is `blocked` (with the reason). Never continue past `blocked`. Do not start F2 or any other task.
