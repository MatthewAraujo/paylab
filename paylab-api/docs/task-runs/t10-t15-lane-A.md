# Lane A brief: T10

Repo/dir: `paylab-api/` (work inside your isolated worktree, branched from `feat/t10-t15-integration`).

Rules: PRD and ADRs 0001-0004 are approved; do not re-interview or change scope. Do NOT edit `docs/TASKS.md`, the PRD, existing ADRs or task specs. Run each task via `task-runner` in **lane mode** (context pack `docs/task-runs/T<n>-CONTEXT.md`, `tdd` test first, `docs/task-runs/T<n>-summary.md`, one commit; stage paths explicitly, never `git add -A`, exclude `docs/TASKS.md`). Docker is available for Testcontainers. Run `pnpm typecheck`, `pnpm lint` and the relevant test layers before committing. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. No sync points. If a task needs a file outside the path boundary, stop and report. Never continue past `blocked`. Report per-task result, commands run, and decisions when done.

## Tasks
- T10 Concurrency suite (`docs/tasks/T10.md`). Re-read ADR 0002 first.

## Path boundary
Modify only: `test/concurrency/` (or the existing concurrency folder), `vitest.config.concurrency.ts`, test helpers under `test/` that are new files, `docs/task-runs/T10-*.md`. Production code under `src/` only if a test exposes a real defect: then stop, report the defect precisely, and fix minimally with its own regression test.

## Specific requirements
- Randomized rounds enough that a deliberately broken lock (e.g. no lock at all) fails reproducibly; demonstrate this once by temporarily removing the lock locally (do not commit the break) and record the result in the summary.
- Must pass at least 10 consecutive runs of `pnpm test:concurrency` with zero flakiness. Any flaky test is a defect: fix the cause, never retry it away. Record the 10 run results in the summary.
- Verify empirically that `FOR UPDATE` blocks a credit (FK `FOR KEY SHARE` conflict) while `FOR NO KEY UPDATE` does not; record as a note for the ADR trail in the summary (do not edit ADR 0002).
