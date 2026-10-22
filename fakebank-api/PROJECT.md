# FakeBank API

A fictional external payment provider (PSP/partner bank) used as an adversarial test environment for PayLab. A standalone NestJS HTTP service with its own PostgreSQL database; PayLab sees it only over HTTP ([ADR 0001](docs/adr/0001-fakebank-as-an-independent-http-service.md)). It never imports code from `paylab-api`.

Domain language and accumulated decisions live in [CONTEXT.md](CONTEXT.md); requirements in [docs/PRD.md](docs/PRD.md); the plan in [docs/TASKS.md](docs/TASKS.md). This file only covers how to work in the service.

## Stack

- Node.js 22+, pnpm 11 (pinned in `package.json`; `mise.toml` provides the same version), TypeScript.
- NestJS 11, Zod for environment validation, `@nestjs/swagger` for the OpenAPI document.
- PostgreSQL 16, Prisma 6 (client and migration runner; hand-written SQL migrations are the source of truth).
- Vitest with SWC, Supertest, Testcontainers (a disposable PostgreSQL per test run).
- Biome for lint and formatting.

## Structure

| Path | Contents |
| --- | --- |
| `src/infra/main.ts`, `app.factory.ts`, `app.module.ts` | Bootstrap; `configureApp` holds the HTTP configuration shared with the test app |
| `src/infra/env` | Zod environment schema (`env.ts`), `EnvModule`, typed `EnvService` |
| `src/domain` | Pure domain rules with no Nest or Prisma dependency (the Provider Transaction state machine) |
| `src/infra/database` | `DatabaseModule` and `PrismaService` |
| `src/infra/auth` | Client API key hashing, `ClientAuthGuard` (Bearer key → Client) and `@CurrentClient()` |
| `src/infra/transactions` | Public `/v1/transactions` API: controller, Zod schemas, representation, creation service (the full attempt pipeline: pre-persistence Outcomes, idempotency, scenario decision, post-commit delay and error), repository (`applyDecision` is the only path that changes an existing transaction) |
| `src/infra/scenarios` | Simulation Scenarios: repository (atomic `consumeAttempt`) and `ScenarioAttempts` (Outcome decision) |
| `src/infra/lab` | Lab surface, loaded only when `FAKEBANK_LAB_ENABLED=true`: `POST /__test/scenarios` and the advance use case (`POST /__test/transactions/:id/advance`) |
| `src/infra/http` | Controllers, `request-id.ts` (X-Request-Id), `errors/` (error envelope and global filter), `openapi/` (Swagger setup and documentation shapes) |
| `prisma/` | `schema.prisma` and `migrations/` |
| `scripts/` | Small operator scripts (`hash-client-key.mjs`) |
| `test/` | `domain`, `infra` (unit), `integration`, `e2e`, `concurrency`, and `support` (Testcontainers setup, `buildTestApp`, database reset, test Clients) |
| `docs/` | PRD, task plan, task specs, task run records, ADRs |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies (postinstall runs `prisma generate`) |
| `pnpm dev` | Run the API in watch mode (port 4000) |
| `pnpm build` / `pnpm start:prod` | Compile to `dist/` and run the build |
| `pnpm lint` / `pnpm lint:fix` | Biome check / autofix |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (no database, no Docker) |
| `pnpm test:integration` | Real PostgreSQL: schema and trigger tests |
| `pnpm test:e2e` | HTTP API against the Testcontainers database (the main seam) |
| `pnpm test:concurrency` | Parallel-request suite, run separately from the fast gate |
| `pnpm prisma:migrate` | Create/apply a migration in development |
| `pnpm prisma:migrate:deploy` | Apply existing migrations |
| `pnpm client-key:hash <key>` | Print the SHA-256 of a Client key for `FAKEBANK_CLIENTS` (or pipe the key on stdin to keep it out of shell history) |

Docker is required for every database test layer (integration, e2e, concurrency); each run starts one `postgres:16-alpine` container and applies the migrations with `prisma migrate deploy`. Unit tests need no Docker.

## Conventions

- **Errors.** Every error response is `{ code, message, retryable, requestId }`, produced only by `ErrorEnvelopeFilter`. Throw an `HttpException` whose body is `{ code, message }` for business errors; anything that is not an `HttpException` becomes a generic `500 PROVIDER_INTERNAL_ERROR` and is logged, never exposed. `retryable` is decided only in `src/infra/http/errors/error-envelope.ts` (true for 429, 500, 503). Errors that need response headers (such as `Retry-After`) throw `HttpExceptionWithHeaders`; the filter writes its headers.
- **Request id.** `X-Request-Id` is echoed when it is printable ASCII of at most 128 characters, otherwise a UUID is generated; it is on every response header and in every error body.
- **Migrations** are hand-written SQL; the Prisma schema follows them, never the other way around. Amounts are integer minor units (`BIGINT`), never decimals.
- **Authentication.** Public routes use `@UseGuards(ClientAuthGuard)` and read the Client with `@CurrentClient()`; every query is scoped by its `clientId`, so another Client's data answers like an unknown id. Keys are never logged.
- **Validation.** Request parts are parsed with Zod through `ZodValidationPipe` (`src/infra/http/zod-validation.pipe.ts`), which answers `400 VALIDATION_ERROR`.
- **Tests** authenticate with the plaintext keys in `test/support/clients.ts` (`bearer(TEST_CLIENTS.paylab)`); `setup-env.ts` configures only their hashes. Tests boot the real `AppModule` through `test/support/app.ts` (`buildTestApp`), which applies the same `configureApp` as production. Test-only routes go in `buildTestApp({ controllers })`; provider overrides in `buildTestApp({ configure })`. Every test layer runs with the lab on; `bootWithEnv` (`test/support/fresh-app.ts`) boots an app with another environment (e.g. lab off). Concurrency tests use `buildListeningApp` and `inParallel` from `test/support/concurrency.ts`.

## Local setup

1. `pnpm install`
2. `cp .env.example .env`
3. Start a PostgreSQL matching `DATABASE_URL` (the example uses port 5434, so it does not collide with PayLab's 5432/5433), e.g. `docker run -d --name fakebank-postgres -e POSTGRES_USER=fakebank -e POSTGRES_PASSWORD=fakebank -e POSTGRES_DB=fakebank -p 127.0.0.1:5434:5432 postgres:16-alpine`, then `pnpm prisma:migrate:deploy`
4. `pnpm dev`, then `curl localhost:4000/health` and open http://localhost:4000/docs
5. Create a transaction with the development key from `.env.example`: `curl -X POST localhost:4000/v1/transactions -H 'Authorization: Bearer fakebank-dev-key-paylab-not-a-secret' -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' -d '{"externalReference":"payment-1","amountMinor":1500,"currency":"BRL"}'`. Repeating it returns `200` with `Idempotent-Replayed: true`; the same key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`. List by reference with `GET /v1/transactions?externalReference=payment-1`.
6. Simulate a provider behavior (lab on) before creating a transaction for that reference: `curl -X POST localhost:4000/__test/scenarios -H 'Authorization: Bearer fakebank-dev-key-paylab-not-a-secret' -H 'Content-Type: application/json' -d '{"externalReference":"payment-2","outcome":"RATE_LIMIT","retryAfterSeconds":5,"times":1}'`. Outcomes: `SUCCEED`, `FAIL` (needs `failureCode`), `DEFERRED`, `RATE_LIMIT`, `ERROR_BEFORE_COMMIT`, `ERROR_AFTER_COMMIT`; `delayMs` waits after commit. Decide a deferred transaction with `POST /__test/transactions/<id>/advance` and `{"status":"FAILED","failureCode":"ACCOUNT_BLOCKED"}` or `{"status":"SUCCEEDED"}`.

## Docker

The development image (`Dockerfile`, Node 22, pnpm 11.9.0, `procps` for watch-mode restarts) applies the migrations on start, then runs `pnpm dev`. It is not a production image.

- **Standalone** (this directory): `docker compose up --build` starts FakeBank and its own PostgreSQL (Compose project `fakebank-api`, volume `fakebank-postgres-data`, database not published). FakeBank answers on http://localhost:4000 (`/health`, `/docs`), bound to 127.0.0.1. The source is baked into the image, so rerun with `--build` after changes. `docker compose down` keeps the data volume.
- **Workspace stack** (workspace root): `docker compose up --build` also starts `fakebank` and `fakebank-postgres` with `src` and `prisma` mounted, so edits reload the service; see the workspace [PROJECT.md](../PROJECT.md).

Both stacks publish 127.0.0.1:4000, so run one at a time. Both configure the development Client `paylab` with the public, fake key `fakebank-dev-key-paylab-not-a-secret` (`FAKEBANK_CLIENTS` holds only its hash) and set `FAKEBANK_LAB_ENABLED=true`. These values are for local development only; any other environment needs its own random key, hashed with `pnpm client-key:hash`, and the lab disabled.

## Environment variables

Validated at boot by `src/infra/env/env.ts` (the service refuses to start with an invalid value and names it); defaults in `.env.example`. Real `.env` files are gitignored, and secrets are never committed.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL; FakeBank's own database, never PayLab's |
| `PORT` | Default 4000 |
| `NODE_ENV` | `development`, `test` or `production` |
| `APP_NAME` | Default `fakebank-api`; reported by `/health` |
| `FAKEBANK_CLIENTS` | Required. Comma-separated `clientId:sha256-hex-of-key`; malformed, duplicated ids or duplicated hashes refuse the boot. `.env.example` holds a public, fake development key and its hash |
| `FAKEBANK_LAB_ENABLED` | Lab surface switch. Default `false`; `true` exposes the lab surface (`/__test/...`). The development Compose files set it to `true`; never enable it outside development; the boot refuses it with `NODE_ENV=production` |
| `LOG_ENABLED`, `LOG_LEVEL` | Errors and warnings are always logged; `LOG_ENABLED=true` adds the regular log, `LOG_LEVEL=debug` the debug and verbose levels |
