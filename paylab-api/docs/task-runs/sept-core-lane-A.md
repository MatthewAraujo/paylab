# Lane A brief: T2 -> T3 -> T4

Repo/dir: `paylab-api/` (work inside your isolated worktree).

## Tasks (in order)
- T2 Test infrastructure: Testcontainers and suite layout (`docs/tasks/T2.md`)
- T3 Schema baseline: accounts, payments and the ledger (`docs/tasks/T3.md`)
- T4 Ledger integrity triggers and the global invariant check (`docs/tasks/T4.md`)

## Path boundary
Modify only: `package.json`, `pnpm-lock.yaml`, `vitest.config*.ts`, `prisma/`, `prisma.config.ts`, `test/` (except `test/domain/`), `.github/`, `docker-compose.yml` if needed, `docs/task-runs/T2..T4-*.md`.
Do NOT touch `src/` PayLab domain folder (`src/**/enterprise`, `src/**/application`) or `test/domain/` (Lane B owns them). Do NOT edit `docs/TASKS.md`, PRD, ADRs or task specs. If a task needs a file outside the boundary, stop and report.

## Loop
For each task in order run `task-runner` in **lane mode**: context pack, `tdd` (test first), summary, one commit per task (stage paths explicitly; exclude docs/TASKS.md). Docker is available for Testcontainers. Run typecheck, lint and the relevant test layers before each commit.

## Sync points
None. Do not start T6 or later.

## Stop conditions
Report when T4 is finished or any task is `blocked`; never continue past `blocked`. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
