# T5 Summary

## Status
Completed. AC-14, AC-15, AC-16 and AC-1 are validated.

## What Changed
The root `PROJECT.md` gained a "Production-local Docker" section covering:
- env setup;
- addresses;
- the absence of Swagger and the benchmark API in production;
- initialization and failure behavior;
- volumes and the credential;
- logs, stop and rebuild;
- the port conflict with development;
- the smoke script;
- backup and stop-first restore, with an explicit data-replacement warning and the credential-consistency rule.

The root `README.md` points to it, the API/UI `PROJECT.md` files mention their `Dockerfile.production`, and the API `CONTEXT.md` records the runtime-dependency classification gotcha. The specification index links this PRD and plan.

## Files Changed
`PROJECT.md`, `README.md`, `paylab-api/PROJECT.md`, `paylab-ui/PROJECT.md`, `paylab-api/CONTEXT.md`, this run record and the plan index.

## Tests Added or Updated
No new automated tests. The restore drill (scratchpad script) ran the documented commands verbatim: a 56K custom-format dump, ignored by git. The Payments count went 174 → 175 after a probe `POST /v1/payments` (201), then back to 174 after the restore. `demo-init` then reported `Existing demo data and credential preserved.`, and `scripts/check-production-stack.py` passed (6 Wallets, authenticated reads). The ledger triggers did not block the restore, because `pg_restore` creates triggers after loading the data.

## Commands Run
- The documented backup and restore commands, through the drill script.
- `curl` against the console (`/benchmarks` and `/dashboard` return 200) and the API (`/v1/benchmarks` and `/docs` return 404 in production).
- `docker compose up --build -d --wait` (development, rebuilt with the new API lockfile): healthy, `NODE_ENV=development`, existing data preserved.
- `python3 scripts/check-docker-reload.py`: both PASS; sources restored.
- In the development API image:
  - `pnpm typecheck` passes.
  - `pnpm lint`: the only finding is a formatting issue in `paylab-api/.claude/settings.local.json`, an untracked local tool file that `COPY . .` puts in the image.
  - `pnpm test`: 46 failures in 7 benchmark files. The development image has no `git` (`spawnSync git ENOENT`), and `.env.example` and `../PROJECT.md` are absent from the container.
  - Rerun with git installed temporarily: 382/384 pass. The remaining docs spec passes 8/8 with `.env.example` and the workspace `PROJECT.md` mounted read-only. All 384 API tests therefore pass once the environment is complete.
- UI checks were run in T2 (467 tests pass).

## Validation Result
All PRD criteria for this task are met. The API test and lint failures in the development image are environmental and predate this work. The image has no git and its build context excludes `.env*`; the lint finding is in an untracked local file, not in the repository's sources.

## Decisions Made
- The restore uses `--single-transaction`, so a failed restore leaves the previous data intact; `--no-owner` keeps it independent of the role name.
- No backup of the credential volume: the dump contains only the key hash, and the documentation requires keeping the matching credential volume.

## Follow-up Needed
Optional, out of scope: add `git` to the API development image, or exclude `.claude/` from the API build context, if running the full API suite inside the development image is a goal.

## Context for Next Task
All tasks are done. Both stacks are stopped with their volumes preserved; the local `.env.production` and the drill dump in `backups/` remain untracked.
