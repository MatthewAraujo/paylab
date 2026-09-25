# Frontend lane 5 — F12 (accessibility, responsive, browser smoke, documentation)

Runs alone in the integration worktree (`/home/matthew/personal/paylab-benchmark-report/paylab-ui`, branch `feature/benchmark-report`). Shared benchmark files may be edited for polish only; do not change financial routes.

## Task

**F12** — spec `../tasks/F12.md`, PRD stories US-91..96 and end-to-end validation. Deliver:
1. Automated a11y checks (status/change meanings have text, keyboard reachability and visible focus, dialogs restore focus, reduced motion disables animation), fixing any defect found (including `--success` contrast).
2. Playwright smoke in `tests/e2e/` with request interception and typed fixtures (`src/test/benchmark-fixtures*.ts`): navigate to Benchmarks, latest Run, comparison selection, Run detail, Artifact opening, Baseline selection including the cross-origin `PUT` with CORS preflight as the browser sends it (intercept, assert method/body has only the Run id), and a configured API base URL. Follow the existing `playwright.config.ts`; check whether browsers are installed (`pnpm exec playwright --version`; install only if needed and tell me).
3. Manual checklist (1440/1024/390 px, 200% zoom, against a real local API with imported evidence) written to `task-runs/F12-manual-checklist.md` as unverified steps for the user; you cannot run a browser by eye, so do not claim it was verified.
4. Docs: `PROJECT.md` (capability, routes, env var, commands) and `CONTEXT.md` (terms, browser-direct reads, local-only boundary, zero-reference divergence), no duplication between them; `.env.example` comments.

## Rules

Read `../PRD.md`, `../tasks/F12.md`, and all task summaries F1–F11 first. Read `AGENTS.md`. Never call `fetch` directly in app code; never import `PayLab-Benchmarks-source/`; NEVER run `git stash`, `git clean`, `git reset --hard`. Do not start the API or touch any Docker container. One atomic commit per logical unit (tests+fixes, e2e, docs) with explicit paths, no `git add -A`; do not edit `TASKS.md`. `pnpm build` rewrites `next-env.d.ts`: revert it before typecheck and commits. TDD: failing test first, record red runs.

## Validation and stop

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, reporting each exit code. Report per commit: sha, decisions, follow-ups, anything not verified. Stop if blocked. Do not spawn subagents.
