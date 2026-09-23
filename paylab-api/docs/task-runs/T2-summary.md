# T2 Summary

## Status

done

## What Changed

- Added `testcontainers` and `@testcontainers/postgresql`; scripts `test` (unit), `test:integration`, `test:e2e`, `test:concurrency`.
- One Vitest config per layer plus `vitest.config.shared.ts`. Database layers use a global setup (`test/support/global-setup.ts`) that starts `postgres:16-alpine`, runs `prisma migrate deploy` and provides the URL to workers via `project.provide`/`inject`; `setup-env.ts` (moved from `test/setup-e2e.ts`) applies env defaults and the injected URL.
- `test/support/`: `database.ts` (Prisma client, `resetDatabase` truncating all public tables except `_prisma_migrations`, `migrationsApplied`, `createPools`), `invariants.ts` (placeholder for T4), `setup-database.ts` (reset before, invariant check after each test; integration and concurrency), `app.ts` (`buildTestApp`).
- CI: Docker-based Testcontainers; jobs lint, typecheck, tests (unit + integration + e2e), and a separate non-blocking `concurrency` job.
- `pnpm-workspace.yaml`: optional native build scripts of testcontainers deps (`cpu-features`, `protobufjs`, `ssh2`) set to `false` so `pnpm install --frozen-lockfile` does not fail with ERR_PNPM_IGNORED_BUILDS.

## Files Changed

package.json, pnpm-lock.yaml, pnpm-workspace.yaml, vitest.config*.ts, test/support/*, test/integration/database.spec.ts, test/concurrency/connections.spec.ts, test/e2e/health.e2e-spec.ts, .github/workflows/ci.yml.

## Tests Added or Updated

Unit smoke, integration (SELECT 1, migrations from empty, isolation across specs, idempotent reset), concurrency (two independent pools run in parallel), e2e health now uses `buildTestApp`.

## Commands Run

`pnpm test` (33 passed), `pnpm test:integration` (5), `pnpm test:concurrency` (1), `pnpm test:e2e` (1), `pnpm typecheck`, `pnpm lint`.

## Validation Result

All green locally with Docker. CI not run (no push).

## Decisions Made

- Truncate helper discovers tables dynamically; T3 must keep the seeded clearing Account alive across resets.
- E2E layer does not auto-reset or auto-check invariants yet; decide when the first DB-writing e2e test lands.
- Unit config keeps the `test/**/*.spec.ts` glob (minus other layers) so Lane B's `test/domain/` specs run without config changes.
- Specs were written before the helpers, but the red run was not captured separately.

## Follow-up Needed

CI concurrency job uses `continue-on-error`; document in T15.

## Context for Next Task

Use `prisma` and `resetDatabase` from `test/support/database`. `prisma migrate deploy` with no migrations succeeds and creates `_prisma_migrations`.
