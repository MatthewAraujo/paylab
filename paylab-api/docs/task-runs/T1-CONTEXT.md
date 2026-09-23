# T1 Context

## Task

Prune the copied reference project down to the technical spine: remove all Quintal Agro Pet business code and the infrastructure PayLab does not use in September, rename the project, and leave an app that boots with only `GET /health`. Spec: [docs/tasks/T1.md](../tasks/T1.md).

## Related PRD Acceptance Criteria

- US-80 local run and inherited logging.
- US-83 structured errors and logging inherited and still working.
- PRD "Out of Scope": no Redis, storage, geocoding, WebSocket, Better Auth.

## Relevant Prior Summaries

None. T1 has no dependencies.

## Files Likely Affected

- Removed: `src/domain/quintalpet`, business controllers/modules/presenters/gateways, `src/infra/{better-auth,cache,geocoding,storage,database}`, `src/shared/{audit,storage,tenancy}`, `scripts/`, `prisma/migrations`, `prisma/seed.ts`, business tests, `railway.json`, production env examples.
- Adapted: `src/infra/{app.module,app.factory,env,observability}`, `src/infra/http/{controllers/health.controller,error-translation}`, `package.json`, `tsconfig*.json`, `prisma/schema.prisma`, `prisma.config.ts`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`.

## Test-First Plan

1. Rewrite `test/infra/env/env.spec.ts` for the new schema (defaults, missing and invalid `DATABASE_URL`, logging config) and see it fail.
2. Point `test/e2e/health.e2e-spec.ts` and `test/setup-e2e.ts` at `paylab-api` with no database.
3. Prune in steps, typechecking between steps; rewrite the observability and error-translation specs to match the reduced code.

## Constraints

- The reference project (`../petagro-api`) is read-only; no business code is copied.
- No database is required; health e2e must not need PostgreSQL.
- English for code, comments, docs and commits.
- No PayLab business code in this task.

## Risks

- Dead references after bulk deletion (mitigated by typecheck and a repository-wide search).
- Dropping something later tasks need (the translation mechanism, pipes, security and logging are kept).

## Definition of Done

`pnpm install`, `pnpm typecheck`, `pnpm lint` and the surviving tests pass; the built app boots and `GET /health` answers; a repository-wide search finds no Quintal, agropet, better-auth, socket.io, redis, geocoding or storage code.
