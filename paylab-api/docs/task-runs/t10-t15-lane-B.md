# Lane B brief: T11

Repo/dir: `paylab-api/` (work inside your isolated worktree, branched from `feat/t10-t15-integration`).

Rules: PRD and ADRs 0001-0004 are approved; do not re-interview or change scope. Do NOT edit `docs/TASKS.md`, the PRD, existing ADRs or task specs. Run each task via `task-runner` in **lane mode** (context pack `docs/task-runs/T<n>-CONTEXT.md`, `tdd` test first, `docs/task-runs/T<n>-summary.md`, one commit; stage paths explicitly, never `git add -A`, exclude `docs/TASKS.md`). Docker is available for Testcontainers. Run `pnpm typecheck`, `pnpm lint` and the relevant test layers before committing. Do not push. Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. No sync points. If a task needs a file outside the path boundary, stop and report. Never continue past `blocked`. Report per-task result, commands run, and decisions when done.

## Tasks
- T11 History, Payment list and daily report with keyset pagination (`docs/tasks/T11.md`).

## Path boundary
Modify only: new read queries/controllers/presenters/cursor helper under `src/` (application + infra layers; wire into existing modules with minimal edits), `test/` files for them, `docs/reads-sql.md` (new), `docs/task-runs/T11-*.md`. Do not touch PROJECT.md, CI files, `test/concurrency/`.

## Specific requirements
- Public contract is cursor-only keyset (created time desc, then id desc, row-value comparison). Never expose offset.
- Merchant-scoped; another Merchant's Account is not-found (same as existing rule). Enforce default and max page size. Report days in UTC.
- Use raw SQL for the keyset queries (ADR 0004). Record the EXACT SQL text of each read query (history, Payment list with each filter combination, daily report), with parameter meaning, in `docs/reads-sql.md` for T12-T14 to reuse. Ideally the app runs the same text (export the SQL from one constant that the doc mirrors).
- Do not add indexes (T13's subject).
