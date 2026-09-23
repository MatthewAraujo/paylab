# T15 Summary

## Status

done

## What Changed

- `PROJECT.md` rewritten as the stable handbook: stack, structure, commands, local setup, env variables, testing layers, conventions, CI, sources of truth. No domain knowledge.
- New `docs/DEVELOPMENT.md`: clean clone to green tests, running app, Merchant provisioning, change workflow, migrations.
- CI: `timeout-minutes` (20) on `tests` and `concurrency`; the concurrency job stays separate and non-blocking.
- PR template: adds `pnpm test:integration` and `pnpm test:concurrency` validation items.

## Files Changed

`PROJECT.md`, `docs/DEVELOPMENT.md`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/task-runs/T15-*.md`.

## Tests Added or Updated

None (documentation and pipeline task).

## Commands Run

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (85), `pnpm test:integration` (57), `pnpm test:e2e` (40). On a temporary PostgreSQL 16 container: `pnpm prisma:migrate:deploy`, `pnpm merchant:provision "Acme Ltda"`, `pnpm build`, run `dist/infra/main`, `GET /health` returned `ok`. Every `pnpm` command named in the docs exists in `package.json`. Workflow YAML parses (ruby). Leftover search: only `.gitignore`, PROJECT.md and docs mention `petagro-api` as the read-only reference; no tracked file under `petagro-api`.

## Validation Result

Green. Not run: the real GitHub Actions pipeline (no push); `pnpm test:concurrency` (unchanged, out of scope); the compose database itself (an equivalent temporary container on another port was used to avoid touching port 5432 and `./data/pg`).

## Decisions Made

Kept the concurrency job `continue-on-error` as decided in T2. Left workflows in `paylab-api/.github/`.

## Follow-up Needed

- `.github/` sits under `paylab-api/`, but the git root is the parent directory (which also holds `paylab-ui/`). Actions will not run from there unless `paylab-api` is published as its own repository root, or the workflows move to the root with `working-directory: paylab-api`. Needs a decision.
- The parent adds the benchmark pointer to PROJECT.md after wave 3; extend the Commands table if T11/T12 add scripts.

## Context for Next Task

PROJECT.md "Commands" and "Structure" tables are where new scripts go.
