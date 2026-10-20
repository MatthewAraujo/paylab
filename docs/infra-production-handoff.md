# Production-local Docker infrastructure handoff

## Status

The design interview is complete and the user approved every decision below. No production-infrastructure files have been changed yet. Existing untracked learning materials (`MISSION.md`, `NOTES.md`, `RESOURCES.md`, `assets/`, `lessons/`, `reference/`) belong to the user and must be preserved.

## Approved scope

Improve PayLab's container infrastructure by adding a production-local Compose configuration while preserving the existing development workflow.

- Keep the root `compose.yaml` unchanged in purpose: local development with hot reload.
- Add `compose.production.yaml`, started with `docker compose -f compose.production.yaml up --build -d`.
- Bind all published production-local application ports to `127.0.0.1`. There is no reverse proxy, public domain, TLS, or UI login in this scope.
- Use the existing demo initializer and its `Demo Store` data. It applies migrations and seeds only when the dedicated production database volume is empty; subsequent starts validate and preserve the matching credential volume.
- Use distinct named volumes for the production-local PostgreSQL data and the Merchant API key. The key stays server-only and is mounted read-only for the UI.
- Add multi-stage Dockerfiles for API and UI. Build dependencies/tools must not enter the final runtime images.
- Run API and UI as non-root users. PostgreSQL remains on its official image behavior.
- Add healthchecks to PostgreSQL, API, and UI. Configure `restart: unless-stopped` for these long-running services. The migration/demo initializer is one-shot and has no restart policy. API waits for successful initialization; UI waits for healthy API.
- On every release startup, run versioned migrations before API availability. A migration/init failure keeps dependent services unavailable.
- Use a gitignored `.env.production` for real values, with a tracked `.env.production.example` containing names and safe example values only.
- Backups are manual: document compact PostgreSQL dumps to gitignored `./backups/`, plus a restore procedure that requires stopping the stack first.

## Facts verified in the current code

- Root `compose.yaml` already has persistent `postgres-data` and `demo-credentials`, a PostgreSQL healthcheck, an API healthcheck, and the `demo-init` guard.
- `paylab-api/scripts/docker-demo.ts` intentionally refuses credential/database mismatches and writes `/run/paylab/api-key` with mode `0600`.
- API runs in production through `pnpm start:prod` (`node dist/infra/main`). Prisma migrations are under `paylab-api/prisma/migrations`.
- UI runs with Next.js 16. Its `next.config.ts` does not yet enable standalone output, so production image work needs that configuration.
- Current Dockerfiles are development-only, single-stage builds running as root.

## Required workflow for the next agent

The repository's `AGENTS.md` requires this order for a feature/refactor:

1. The grilling phase is complete; use this document as its resolved output.
2. Use `to-prd` to create a scoped infrastructure PRD. It must explicitly preserve development behavior and list acceptance criteria for all approved items.
3. Use `task-planner` to create `docs/TASKS.md` entries and task files. Do not write production code until the PRD and plan are present and read.
4. Use `task-runner`/`tdd` to implement and validate the plan.
5. Finish with `pr-review` and `pr` if the user requests a pull request.

## Suggested acceptance evidence

- Compose configuration validates for development and production-local files.
- Production API and UI images build successfully and containers report their healthchecks as healthy.
- Process inspection confirms API and UI do not run as root.
- First startup initializes the demo data and renders authenticated console data.
- A restart preserves the database and credential volumes without reseeding.
- A stopped/restarted API or UI is recovered by its restart policy.
- A documented backup can be created; the restore instructions are explicit about stopping the stack and their destructive effect.
- No secrets appear in tracked files or image build arguments.
