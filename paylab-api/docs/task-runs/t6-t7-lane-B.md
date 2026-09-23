# Lane B brief: T7

Repo/dir: `paylab-api/` (your isolated worktree).

## Tasks
- T7 Merchant provisioning script and API key authentication (`docs/tasks/T7.md`): provisioning script, hashed keys shown once, guard, current-Merchant decorator.

## Path boundary
Modify only: a scripts folder for the provisioning script (plus its `package.json` script entry, one line), new merchant/API-key repositories and authenticate use case (`src/domain/paylab/application/**` new files only, not the Settlement/Balance/accounts/payments ports), new Prisma repositories under `src/infra/database/**` (new files; `PrismaService` and `DatabaseModule` already exist, do not edit them), a new auth module/guard/decorator under `src/infra/http/**` or `src/infra/auth/**`, `test/**` for your tests, `docs/task-runs/T7-*.md`.
Shared touch points (`src/infra/app.module.ts`, the PayLab Nest module wiring): keep additions minimal and additive; do not refactor. Lane A also adds providers; put yours in your own file/section so the merge is a union.
Do NOT edit `docs/TASKS.md`, PRD, ADRs or task specs. If a task needs a file outside the boundary, stop and report.

## Rules
- Never log or store the raw API key (and do not log the hash). Compare hashes in constant time (`timingSafeEqual`).
- Fast cryptographic hash for high-entropy keys, not a slow password hash. No user sessions or roles.
- Test first (`tdd`), following the T7 spec. Run the global invariant helper after DB tests where relevant.

## Loop
Run `task-runner` in **lane mode** for T7: context pack, `tdd`, summary, one commit (stage paths explicitly; exclude `docs/TASKS.md`). Run `pnpm typecheck`, `pnpm lint`, and the relevant test layers before committing. Docker is available.

## Stop conditions
Stop after T7; do not start T8 or later. Stop if `blocked`. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Report: what changed, what was tested, files touched in shared files, risks.
