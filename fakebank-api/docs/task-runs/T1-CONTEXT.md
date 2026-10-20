# T1 Context

## Task

Service skeleton ([spec](../tasks/T1.md)): create the `fakebank-api` NestJS service with toolchain, Zod-validated environment, Prisma setup with an empty baseline migration, the error envelope, request-id handling, `GET /health`, Swagger at `/docs`, and the unit / integration / e2e / concurrency test layers. No payment behavior.

## Related PRD Acceptance Criteria

- AC-11: `GET /health` answers `200` without authentication.
- AC-10 (foundation): every error response is `{ code, message, retryable, requestId }`; `retryable` is true exactly for `429`, `500`, `503`; `X-Request-Id` is used and echoed, otherwise generated and echoed.
- AC-12 (foundation): OpenAPI documentation served at `/docs` (and `/docs-json`), describing the error shape.

## Relevant Prior Summaries

None (first task).

## Files Likely Affected

All new, under `fakebank-api/`: `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `biome.json`, `nest-cli.json`, `mise.toml`, `.env.example`, `.gitignore`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/*`, `src/infra/**`, `vitest.config*.ts`, `test/support/**`, `test/e2e/**`, `test/infra/**`, `PROJECT.md`.

Prior art (copied and trimmed, never imported, per ADR 0001): `paylab-api` vitest configs, `test/support/{global-setup,setup-env,setup-database,database,app}.ts`, `src/infra/{env,database,app.factory.ts,app.module.ts,main.ts}`, health controller, Swagger setup.

## Test-First Plan

1. Unit (`test/infra/env.spec.ts`): env schema refuses a missing `DATABASE_URL` with a message naming it; `PORT` defaults to 4000.
2. E2E (`test/e2e/health.e2e-spec.ts`): `GET /health` → `200` with no `Authorization` header.
3. E2E (`test/e2e/error-envelope.e2e-spec.ts`): unknown route → `404` envelope, generated `requestId` equals the `X-Request-Id` response header; incoming `X-Request-Id: abc` echoed in body and header; a thrown unexpected error (test-only controller) → `500`, `retryable: true`, no stack or internal message in the body.
4. E2E (`test/e2e/docs.e2e-spec.ts`): `/docs` serves HTML and `/docs-json` an OpenAPI document containing `/health` and the error envelope schema.

## Constraints

- No imports from `paylab-api` (ADR 0001).
- `retryable` derived in one place (429, 500, 503).
- Do not edit `docs/TASKS.md`, the dispatch file, the PRD or task specs.
- Read `package.json` scripts before `pnpm install` (postinstall runs `prisma generate`).

## Risks

- `buildTestApp` must apply the same HTTP configuration as `main.ts` (filter, request-id middleware, Swagger); otherwise e2e tests pass against a differently configured app. Mitigation: one `configureApp` used by both.
- Prisma with no models: `prisma generate` and `migrate deploy` must still work; baseline migration is an empty SQL file.

## Definition of Done

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` green in `fakebank-api`; `pnpm dev` with a local database answers `GET /health` and serves `/docs` on port 4000; `PROJECT.md` written; summary written; one commit.
