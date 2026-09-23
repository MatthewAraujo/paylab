# T2 Context

## Task

Test infrastructure: one disposable PostgreSQL 16 (Testcontainers) per run, four test layers (unit, integration, e2e, concurrency), truncate helper, Nest app builder, invariant hook point, CI update. Spec: `docs/tasks/T2.md`.

## Related PRD Acceptance Criteria

US-81 (schema from empty via `prisma migrate deploy`), US-82 (invariant hook point), US-84 (CI gate).

## Relevant Prior Summaries

`T1-summary.md`: bootable spine, unit specs under `test/core` and `test/infra`, single e2e health spec.

## Files Likely Affected

`package.json`, `pnpm-workspace.yaml`, `vitest.config*.ts`, `test/support/*`, `test/integration`, `test/concurrency`, `test/e2e`, `.github/workflows/ci.yml`.

## Test-First Plan

Smoke spec per layer, isolation spec (row not visible after reset), migration-from-empty spec.

## Constraints

File parallelism off for database suites; one container per run; env defaults so a developer `.env` is never read; Lane B owns `test/domain/` and the `src` domain folder.

## Risks

Docker required; pnpm build-script approval for optional native deps of testcontainers.

## Definition of Done

Each of the four test commands runs its smoke spec green locally; CI uses Testcontainers with a separate non-blocking concurrency job.
