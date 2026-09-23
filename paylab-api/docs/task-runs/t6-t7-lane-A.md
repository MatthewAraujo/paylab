# Lane A brief: T6

Repo/dir: `paylab-api/` (your isolated worktree). Re-read ADR 0001 and ADR 0002 before starting.

## Tasks
- T6 Settlement: lock, funds check and atomic ledger write (`docs/tasks/T6.md`): source-Wallet lock with `FOR NO KEY UPDATE`, Balance from the ledger, atomic ledger write, `INSUFFICIENT_FUNDS` failure, Balance query.

## Path boundary
Modify only: `src/domain/paylab/application/**` (Settlement and Balance use cases), new Prisma repositories and the raw-SQL settlement adapter under `src/infra/database/**` (new files; `PrismaService` and `DatabaseModule` already exist, do not edit them), a new PayLab Nest module file for your providers, `test/integration/**` and `test/domain/**` for your tests, `docs/task-runs/T6-*.md`.
Shared touch points (`src/infra/app.module.ts`, the PayLab Nest module wiring): keep additions minimal and additive; do not refactor. Lane B also adds providers; put yours in your own file/section so the merge is a union.
Do NOT edit `docs/TASKS.md`, PRD, ADRs or task specs. If a task needs a file outside the boundary, stop and report.

## Rules
- Money arithmetic in integers; convert 64-bit DB values (BigInt) only at the infra mapper boundary.
- Run the global invariant helper (`test/support/invariants.ts`) after every integration test.
- Test first (`tdd`), following the T6 spec.

## Loop
Run `task-runner` in **lane mode** for T6: context pack, `tdd`, summary, one commit (stage paths explicitly; exclude `docs/TASKS.md`). Run `pnpm typecheck`, `pnpm lint`, and the relevant test layers before committing. Docker is available.

## Stop conditions
Stop after T6; do not start T7/T8 or later. Stop if `blocked`. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Report: what changed, what was tested, files touched in shared files, risks.
