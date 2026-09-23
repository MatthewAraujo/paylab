# T1 Summary

## Status

Done. All validation green; one stated limitation below (transitive socket.io in the lockfile).

## What Changed

- Removed the whole Quintal Agro Pet domain, all business controllers, modules, presenters and gateways, Better Auth, Redis cache, geocoding, R2 storage, Prisma repositories and mappers, the three scripts, all migrations and the seed, `railway.json`, and the production env examples.
- `AppModule` now imports only config, `HealthModule`, `EnvModule` and `ObservabilityModule`. No database module until T3, so the app boots without PostgreSQL.
- Env schema reduced to `APP_NAME` (default `paylab-api`), `LOG_ENABLED`, `LOG_LEVEL`, `DATABASE_URL`, `NODE_ENV`, `PORT`.
- App factory: removed the Socket.IO adapter and the Better Auth logging branch, restored the default body parser (it was disabled only for Better Auth), kept security headers, CORS, validation pipe, logging interceptor, and Swagger (non-production, retitled PayLab API).
- Observability: removed tenant/user/admin-audit concepts (`storeId`, `userId`, `security.admin_action`); kept request ids, structured logs, redaction and `security.unauthenticated|forbidden|rate_limited` events.
- Error translation: mechanism kept, business maps removed. Only `ResourceNotFoundError` (404) and `NotAllowedError` (403) are registered, with English messages; 403 handling was added to the switch.
- Prisma schema emptied to generator and datasource; `prisma.config.ts` no longer references a seed.
- Package renamed to `paylab-api`; dropped `@aws-sdk/client-s3`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `@thallesp/nestjs-better-auth`, `better-auth`, `ioredis`, `resend`, `socket.io`, `@nestjs/throttler`, `dayjs`, `swagger-ui-express`, `socket.io-client`, `@types/multer`, `@faker-js/faker` (all unused after pruning); removed the four business npm scripts.
- `tsconfig.json` and `tsconfig.build.json` had stale include lists from another project (`mensalize`), so `pnpm typecheck` was checking only a subset; both now include `src/**` (and `test/**` for typecheck).
- Core specs (`either`, `domain-events`, `watched-list`) lived in `src/core` where vitest never collected them; moved to `test/core`.
- `docker-compose.yml`, `.env.example`, `.gitignore`, `ci.yml` renamed/simplified (CI test jobs no longer start PostgreSQL or run `migrate deploy`, since there is no schema yet; T2 and T15 rework this).
- Created empty `src/domain/paylab/{application,enterprise}` locally (git does not track empty directories).
- `PROJECT.md` current-state paragraph updated to reflect the pruned base.

## Files Changed

See the commit. Notable new/rewritten: `test/infra/env/env.spec.ts`, `test/setup-e2e.ts`, `test/e2e/health.e2e-spec.ts`, `test/infra/http/error-translation/*`, `test/core/*` (moved), `docs/task-runs/T1-*.md`.

## Tests Added or Updated

- Env schema spec rewritten (5 tests, including unknown log level), written first and seen failing on the old defaults.
- Health e2e now expects `app: 'paylab-api'` and runs with no database.
- Error-translation, logger and interceptor specs rewritten for the reduced code.
- Core specs relocated so they actually run.

## Commands Run

`pnpm install`, `pnpm remove ...`, `pnpm typecheck` (between steps), `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, then `node dist/infra/main` with `curl /health` and `/docs`.

## Validation Result

- `pnpm typecheck`, `pnpm lint`: clean.
- `pnpm test`: 10 files, 32 tests pass. `pnpm test:e2e`: 1 file, 1 test passes, no database.
- Built app booted with no PostgreSQL; `GET /health` returned 200 `{"status":"ok","app":"paylab-api","environment":"development"}` with security headers; `/docs` returned 200.
- Repository-wide search (excluding `docs/`, which legitimately mention the removed items as scope) finds no Quintal, agropet, better-auth, socket.io, redis, geocoding or storage code. The only hits are unrelated words (`AsyncLocalStorage`, "stored balance").
- Limitation: `pnpm-lock.yaml` still lists `socket.io` transitively, because pnpm auto-installs the optional peer `@nestjs/websockets` of `@nestjs/core`. It is not a declared dependency and no source imports it.

## Decisions Made

- Removed `conflict-response.ts` (its example was Quintal-specific); T9 defines PayLab's conflict shape.
- Kept `frontend-origin.ts`/CORS and `FRONTEND_URL` as an optional setting; kept Swagger outside production.
- Registered 403/404 for the two core errors so the mechanism has tested content; T9 extends the map.
- Deleted the production env examples and `railway.json` (cloud deployment is a Non-Goal).
- Dropped `@faker-js/faker` since nothing uses it; re-add when a task needs it.
- Kept `WatchedList`, `AggregateRoot` and domain events (unit-tested, cheap, may serve T5).

## Follow-up Needed

- T2: Testcontainers, suite layout; `pnpm test` and `pnpm test:integration` are still identical scripts and need separating.
- T15: rewrite CI and the handbook; issue templates under `.github/ISSUE_TEMPLATE` are generic and were left as they are (one mentions production).
- The context pack for this run was written after implementation rather than before; the work itself followed the test-first plan.

## Context for Next Task

The app is a bootable Nest skeleton. `prisma/schema.prisma` is empty and there are no migrations (T3 creates the baseline). `src/infra/env` has `DATABASE_URL` required; test setup supplies a dummy one. Error translation, Zod pipes, `shared/http` pagination DTO and observability are ready for reuse. Typecheck now covers `src` and `test` fully.
