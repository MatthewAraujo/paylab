# T1 Summary

## Status

done

## What Changed

Created the `fakebank-api` NestJS service skeleton: pnpm 11 / Node 22 toolchain, Biome, TypeScript and Nest CLI config, Zod-validated environment (`PORT` default 4000), Prisma 6 with an empty baseline migration, the global error envelope filter, `X-Request-Id` handling, public `GET /health`, Swagger at `/docs` and `/docs-json` (with the `ErrorEnvelopeResponse` schema), the four Vitest layers with Testcontainers support and `buildTestApp`, and the service `PROJECT.md`.

## Files Changed

All new under `fakebank-api/`:

- Toolchain: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `mise.toml`, `tsconfig.json`, `tsconfig.build.json`, `biome.json`, `nest-cli.json`, `.gitignore`, `.env.example`, `prisma.config.ts`.
- Prisma: `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20261020000000_baseline/migration.sql`.
- Source: `src/infra/{main,app.factory,app.module}.ts`, `src/infra/env/{env,env.service,env.module}.ts`, `src/infra/database/{database.module,prisma.service}.ts`, `src/infra/http/{health.controller,request-id}.ts`, `src/infra/http/errors/{error-envelope,error-envelope.filter}.ts`, `src/infra/http/openapi/{swagger,error-envelope.response}.ts`.
- Tests: `vitest.config{,.shared,.integration,.e2e,.concurrency}.ts`, `test/support/{global-setup,setup-env,setup-database,database,app}.ts`, `test/infra/env.spec.ts`, `test/e2e/{health,error-envelope,docs}.e2e-spec.ts`.
- Docs: `PROJECT.md`, `docs/task-runs/T1-CONTEXT.md`, this summary.

## Tests Added or Updated

- Unit `test/infra/env.spec.ts`: missing `DATABASE_URL` refused with a message naming it; `PORT` defaults to 4000.
- E2E `health.e2e-spec.ts` (AC-11): `GET /health` → 200 without `Authorization`.
- E2E `error-envelope.e2e-spec.ts` (AC-10): unknown route → 404 envelope with exactly four keys and generated `requestId` equal to the header; caller `X-Request-Id: abc` echoed in body and header; header echoed on success; unexpected error → `500 PROVIDER_INTERNAL_ERROR`, `retryable: true`, no internal message or stack.
- E2E `docs.e2e-spec.ts` (AC-12): `/docs` serves HTML; `/docs-json` is OpenAPI 3 with `/health` and `ErrorEnvelopeResponse` requiring all four fields.

Each envelope and docs test was watched red before the implementation. The health test went green on its first run because the minimal app module had to exist to boot the e2e harness at all.

## Commands Run

- `pnpm install` (pnpm 11.9.0). Script review before install: the only lifecycle script is `postinstall: prisma generate`, which writes the generated client into `node_modules` and may download Prisma engines; no other script runs on install. The first attempt used mise's pnpm 9.1.0; its lockfile failed pnpm 11's `minimumReleaseAge` supply-chain check, so the lockfile and `node_modules` (both created in this run) were regenerated with pnpm 11, and `mise.toml` now pins `pnpm = "11.9.0"`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm test:concurrency`, `pnpm build`.
- Manual smoke: throwaway `postgres:16-alpine` on `127.0.0.1:5434`, `pnpm prisma:migrate:deploy`, `pnpm dev` → `GET /health` 200 with `X-Request-Id`, `/docs` 200, malformed JSON body → 400 `VALIDATION_ERROR` envelope. Container stopped afterwards (no `.env` file was written; env passed inline).

## Validation Result

- `pnpm lint`: pass (34 files).
- `pnpm typecheck`: pass.
- `pnpm test`: 1 file, 2 tests pass.
- `pnpm test:e2e`: 3 files, 7 tests pass.
- `pnpm test:integration` and `pnpm test:concurrency`: no test files yet, exit 0 (`passWithNoTests`).
- `pnpm build`: emits `dist/infra/main.js`.

## Decisions Made

- `configureApp(app)` is the single HTTP configuration (request-id middleware, `ErrorEnvelopeFilter`, Swagger, shutdown hooks) and `buildTestApp` calls it, unlike `paylab-api`'s test app, so e2e tests cover the real pipeline.
- The request id lives in the `X-Request-Id` response header (set before routing); the filter reads it from there. Incoming values are echoed only when printable ASCII of 1–128 characters; otherwise a UUID is generated (protects the header from injection and logs from flooding).
- Default codes for errors without an explicit code: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 405, 409 `CONFLICT`, 413, 422 `UNPROCESSABLE_ENTITY`, 429 `PROVIDER_RATE_LIMIT`, 500 `PROVIDER_INTERNAL_ERROR`, 503 `PROVIDER_UNAVAILABLE`. A 5xx never exposes its message.
- Swagger is served in every environment (paylab-api hides it in production): FakeBank is a test environment and AC-12/AC-32 expect `/docs`.
- `/health` is liveness only and does not touch the database.
- Logging variables map onto Nest logger levels (`logLevelsFor`); no custom structured logger (YAGNI).
- `tsconfig.build.json` pins `rootDir: ./src` (so `dist/infra/main` exists while `src/infra` is the only folder) and keeps `tsBuildInfoFile` inside `dist` (otherwise Nest's `deleteOutDir` plus a stale incremental file makes `pnpm dev` emit nothing).
- `.env.example` points to a local PostgreSQL on port 5434 to avoid PayLab's 5432 (dev) and 5433 (bench). The Compose task may choose differently.

## Follow-up Needed

- Workspace `PROJECT.md` does not yet list the service commands/port; the PRD assigns that to the Docker/docs task.
- `FAKEBANK_CLIENTS` and `FAKEBANK_LAB_ENABLED` are not in the env schema yet (T3 and the lab task add them).

## Context for Next Task

- **Env**: add variables to `envSchema` in `src/infra/env/env.ts`; read them through `EnvService.get`. `buildEnv` throws `Invalid environment configuration: <VAR>: <reason>`. Test placeholders live in `test/support/setup-env.ts`.
- **Errors**: throw `new HttpException({ code, message }, status)` (or a Nest subclass with that body); `ErrorEnvelopeFilter` adds `retryable` and `requestId`. Do not compute `retryable` elsewhere. Body-parser errors (malformed JSON) already come out as 400 `VALIDATION_ERROR`. To document errors in Swagger, reference `ErrorEnvelopeResponse` from `src/infra/http/openapi/error-envelope.response.ts`.
- **Database**: `PrismaService` is global (`DatabaseModule`). Add tables as new hand-written migrations under `prisma/migrations/<timestamp>_<name>/migration.sql` and mirror them in `schema.prisma`; then `pnpm prisma:generate`. The baseline migration is a no-op `SELECT 1`.
- **Tests**: unit specs `test/**/*.spec.ts` outside `integration/`, `e2e/`, `concurrency/` (T2's state machine goes e.g. in `test/domain/`). E2E specs `test/e2e/**/*.e2e-spec.ts` use `buildTestApp({ controllers?, configure? })` from `test/support/app.ts`; tables are truncated before each test (`test/support/database.ts`, which also exports a `prisma` client for direct row assertions). Integration specs `test/integration/**/*.spec.ts`, concurrency `test/concurrency/**/*.spec.ts`; both share the Testcontainers global setup and run files serially.
- **pnpm**: use pnpm 11.9.0 (mise pins it); pnpm 9 refuses because of `packageManager`.
