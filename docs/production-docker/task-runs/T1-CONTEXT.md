# T1 Context

## Task
[T1](../tasks/T1.md): multi-stage production Dockerfile for `paylab-api` with a non-root runtime stage holding only compiled output and production dependencies, plus a separate initializer target that keeps the tooling needed for `prisma migrate deploy` and the Docker demo initializer.

## Related PRD Acceptance Criteria
AC-8 and AC-9 (API part); supports AC-7 and AC-12.

## Relevant Prior Summaries
[Local Docker T1](../../local-docker/task-runs/T1-summary.md): registry timeouts were solved with pnpm cache mounts, `--network-concurrency=8` and `--fetch-timeout=900000`. The initializer writes `/run/paylab/api-key` with mode `0600` and refuses database/credential mismatches; its guard accepts only `postgres/paylab_demo`.

## Files Likely Affected
New `paylab-api/Dockerfile.production`. Existing `paylab-api/Dockerfile`, `.dockerignore` and `scripts/docker-demo.ts` stay unchanged.

## Test-First Plan
- AC-8: runtime image lacks `tsc`, `nest`, `ts-node`, the Prisma CLI, vitest and `pnpm`.
- AC-8: runtime runs `node dist/infra/main` and answers `/health` against a throwaway PostgreSQL with migrations applied.
- AC-9: runtime `id -u` is non-zero.
- AC-7: initializer target migrates and seeds as `node` and writes the key to a fresh named volume.
- AC-12: no `.env` file in the context or layers; no build arguments.

## Constraints
pnpm 11.9.0 and a frozen lockfile. `postinstall` runs `prisma generate`. Production env validation: `DATABASE_URL` is required, and `FRONTEND_URL` is required by fail-closed CORS. Throwaway containers, network and volumes only; leave development volumes untouched.

## Risks
Pruning dev dependencies may drop the generated Prisma Client or engine. pnpm 11 `allowBuilds` may block scripts in a production install.

## Definition of Done
Both targets build, the checks above pass, and the commands are recorded in the summary.
