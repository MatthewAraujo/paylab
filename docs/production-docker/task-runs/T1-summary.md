# T1 Summary

## Status
Completed. AC-8 and AC-9 (API part) are validated against the built images; the initializer target is validated for AC-7 and AC-12 groundwork.

## What Changed
Added a multi-stage production Dockerfile for the API with two targets. `runtime` holds only `package.json`, production `node_modules` (with the generated Prisma Client) and `dist`, runs `node dist/infra/main` as `node` (uid 1000) with `NODE_ENV=production`. `init` keeps the install tooling, owns `/run/paylab` as `node`, and runs `prisma migrate deploy` followed by the unchanged Docker demo initializer.

Two dependencies were misclassified and blocked a production-only install. The compiled entrypoint imports `dotenv/config` while `dotenv` was a devDependency, so `pnpm start:prod` could not boot with production dependencies only (`MODULE_NOT_FOUND`). Biome, a linter, was a runtime dependency. `dotenv` moved to `dependencies` and `@biomejs/biome` to `devDependencies`. The lockfile was regenerated with the pinned pnpm 11.9.0 (`--lockfile-only`); the diff only moves the two importer entries, and versions are unchanged.

## Files Changed
`paylab-api/Dockerfile.production` (new), `paylab-api/package.json`, `paylab-api/pnpm-lock.yaml`, this run record and the plan index. The development Dockerfile, `.dockerignore` and initializer are unchanged.

## Tests Added or Updated
A throwaway check script (session scratchpad, resources prefixed `paylab-t1-` and removed afterwards) verified:
- non-root uid in both targets;
- absence of pnpm, tsc, nest, ts-node, the Prisma CLI, vitest and biome in the runtime;
- no source, tests or `.env` in the runtime;
- no secret-like variables in the image config;
- the initializer migrates three migrations and seeds 174 Payments into a fresh database and volume;
- the key file is `0600` and readable as `node`;
- a second initializer run preserves the data;
- the runtime answers `/health` against that database.

The repeatable workspace smoke script is T3's deliverable.

## Commands Run
- `docker build -f Dockerfile.production --target runtime|init`
- `pnpm install --lockfile-only --ignore-scripts` (pnpm 11.9.0, inside the development image, in a scratch copy)
- The T1 check script (all PASS)

## Validation Result
All checks pass. Runtime image: 860 MB (198 MB compressed). Init image: 1.46 GB, but it is a one-shot job and not a final runtime image.

There were three failed attempts before the final build:
- `pnpm prune` re-downloaded every package because the store only exists in the cache mount; the slow registry made it time out.
- `pnpm prune` rejects the `--store-dir`/network flags.
- `--config.network-concurrency` crashed pnpm.

The final build passes only `--config.store-dir` on the shared cache mount.

## Decisions Made
- Initializer commands call `node_modules/.bin` directly, so the non-root initializer needs no pnpm home directory.
- Runtime files stay root-owned and read-only for `node`.

## Follow-up Needed
API typecheck, lint and unit tests after the dependency reclassification run with the development regression in T5, which rebuilds the development image with the new lockfile.

## Context for Next Task
Images build with `docker build -f paylab-api/Dockerfile.production --target runtime|init`. The runtime needs `DATABASE_URL` and `FRONTEND_URL`. Authenticated routes live under `/v1/accounts`, `/v1/payments` and `/v1/reports`; there is no `/v1/wallets`.
