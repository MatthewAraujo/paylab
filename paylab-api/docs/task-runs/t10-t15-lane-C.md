# Lane C brief: T15

Repo/dir: `paylab-api/` (work inside your isolated worktree, branched from `feat/t10-t15-integration`).

Rules: PRD and ADRs 0001-0004 are approved; do not re-interview or change scope. Do NOT edit `docs/TASKS.md`, the PRD, existing ADRs or task specs. Run each task via `task-runner` in **lane mode** (context pack `docs/task-runs/T<n>-CONTEXT.md`, `tdd` test first, `docs/task-runs/T<n>-summary.md`, one commit; stage paths explicitly, never `git add -A`, exclude `docs/TASKS.md`). Docker is available for Testcontainers. Run `pnpm typecheck`, `pnpm lint` and the relevant test layers before committing. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. No sync points. If a task needs a file outside the path boundary, stop and report. Never continue past `blocked`. Report per-task result, commands run, and decisions when done.

## Tasks
- T15 Project handbook, CI and developer documentation (`docs/tasks/T15.md`).

## Path boundary
Modify only: `PROJECT.md`, `.env.example`-style files, CI workflows (repo root `.github/` if that is where the repo keeps them; check git root is one level above `paylab-api`), developer guide under `docs/` (new file), PR template, `docs/task-runs/T15-*.md`. `CONTEXT.md` only for pointers. Do not touch `src/` or `test/`.

## Specific requirements
- PROJECT.md: stack, structure, commands (lint, typecheck, test, test:integration, test:e2e, test:concurrency, migrations, merchant:provision), env vars, testing layers, Docker requirement, links to PRD/tasks/ADRs. No domain knowledge (that stays in CONTEXT.md/ADRs). Remove the "stub" language. Do not mention read endpoints or benchmark tooling beyond what exists now; T11/T12 land later (parent adds a benchmark pointer at the end).
- CI: lint, typecheck, unit, integration, e2e in the fast job; concurrency in a separate job.
- Validate: search tracked files for leftover reference-project product references (petagro etc.); confirm nothing under `petagro-api` is tracked. Validate the guide by running its commands where feasible (clean install, `pnpm test`, app boot with docker-compose DB), and validate the workflow YAML syntax.
