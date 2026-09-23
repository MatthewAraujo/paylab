# Lane B brief: T5

Repo/dir: `paylab-api/` (work inside your isolated worktree).

## Tasks
- T5 Domain model: Amount, Accounts and the Payment state machine (`docs/tasks/T5.md`)

## Path boundary
Modify only the PayLab domain folder under `src/` (`enterprise/` entities, value objects, errors; `application/repositories` ports) and its unit specs under `test/domain/` (or the existing unit spec location), plus `docs/task-runs/T5-*.md`.
Do NOT touch `package.json`, lockfile, vitest configs, `prisma/`, CI or `test/` infra (Lane A owns them). If the existing unit vitest config does not pick up your specs, stop and report rather than editing it. Do NOT edit `docs/TASKS.md`, PRD, ADRs or task specs.

## Loop
Run `task-runner` in **lane mode** for T5: context pack, `tdd` (test first), summary, one commit (stage paths explicitly; exclude docs/TASKS.md). Domain is pure: no DB, no Nest container. Run typecheck, lint and unit tests before commit.

## Sync points
None. Do not start T6 or later.

## Stop conditions
Report when T5 is finished or blocked. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
