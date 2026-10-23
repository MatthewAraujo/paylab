# T9 Summary

## Status

done. Every manual check passed. The runtime checks ran against a clean export of `HEAD` plus the T9 files, not the live worktree, because lane A's uncommitted `src` did not compile at that moment (see Validation Result). The workspace runtime check used the Compose project name `paylab-t9` instead of `paylab-local`, so it never touched the user's development volumes.

## What Changed

- A FakeBank development image. On start it applies migrations, then runs `pnpm dev` in watch mode.
- A standalone Compose stack in `fakebank-api` (AC-32).
- `fakebank` and `fakebank-postgres` services and a `fakebank-postgres-data` volume appended to the workspace `compose.yaml` (AC-33). The PayLab services are untouched.
- Documentation of both stacks, port 4000, the development-only Client key and the lab flag (AC-34 documentation side).

## Files Changed

- `fakebank-api/Dockerfile` (new): `node:22-bookworm-slim`, `openssl`, `ca-certificates`, `procps`, and `pnpm@11.9.0` installed globally as in `paylab-api/Dockerfile`. `pnpm install --frozen-lockfile` uses a BuildKit cache. `CMD sh -ec "pnpm prisma:migrate:deploy && exec pnpm dev"`.
- `fakebank-api/.dockerignore` (new).
- `fakebank-api/docker-compose.yml` (new): project `fakebank-api`; `fakebank-postgres` (no ports, volume `fakebank-postgres-data`, healthcheck); `fakebank` (`127.0.0.1:4000:4000`, dev key hash, `FAKEBANK_LAB_ENABLED=true`, healthcheck on `/health`).
- `compose.yaml` (workspace root): 43 lines appended after `ui` and 1 line added under `volumes`. `fakebank` mounts `./fakebank-api/src` and `./fakebank-api/prisma`.
- `PROJECT.md` (workspace root): three applications, FakeBank URLs, port 4000, logs command, and a "FakeBank in the development stack" section with the key, the lab flag and a curl example.
- `fakebank-api/PROJECT.md`: a Docker section and a `FAKEBANK_LAB_ENABLED` row, marked as read only once T6 lands.
- `fakebank-api/docs/task-runs/T9-CONTEXT.md`, this summary.

## Tests Added or Updated

None. Compose has no automated layer in this workspace (PRD testing decisions). Validation is the manual commands below.

## Commands Run

Script review before building. The image runs three scripts:

- `postinstall: prisma generate`. It writes the generated client into `node_modules` and downloads the Prisma engines, so the build needs network access.
- `prisma:migrate:deploy` (`prisma migrate deploy`) on every container start. It applies pending migrations to FakeBank's own database only.
- `dev` (`nest start --watch`).

`pnpm-workspace.yaml` `allowBuilds` limits which dependency build scripts run. Install, setup and code-generation risk: network access at build time and engine binaries from Prisma's CDN; no host files are written.

1. **Red.** Before the change, `docker compose config` in `fakebank-api` resolved the workspace stack by walking up to the root `compose.yaml` (project `paylab-local`, services `api`, `demo-init`, `postgres`, `ui`). The standalone command did not exist.
2. **Standalone, live worktree.** `docker compose up --build -d` in `fakebank-api` built the image. On a fresh volume the container applied `20261020000000_baseline` and `20261022000000_provider_transactions` ("All migrations have been successfully applied."). Nest watch then failed on lane A's in-progress edit: `src/infra/transactions/create-provider-transaction.service.ts:51:3 - error TS2322`, so `/health` did not answer. This is outside T9. Ran `docker compose down` (volume kept).
3. **Standalone, clean `HEAD` export** (`git archive HEAD` plus the T9 files, in the scratchpad), same project name and volume:
   - `docker compose config`: services `fakebank`, `fakebank-postgres`; `fakebank` ports `127.0.0.1:4000->4000`; `fakebank-postgres` ports `None`.
   - `up --build -d`: both containers healthy; `fakebank-postgres` shows `5432/tcp` (no host binding); "No pending migrations to apply." (volume from step 2); "Found 0 errors. Watching for file changes."
   - `GET /health` → `200 {"status":"ok","app":"fakebank-api","environment":"development"}`.
   - `GET /docs` → `200 text/html`.
   - `POST /v1/transactions` with `Bearer fakebank-dev-key-paylab-not-a-secret`, `Idempotency-Key: t9-standalone-1` and body `{"externalReference":"payment-t9-1","amountMinor":1500,"currency":"BRL"}` → `201`, `status: SUCCEEDED`, id `FBK-01a1650b-…`.
   - The same POST without a key → `401`.
   - `docker compose down`, volume `fakebank-api_fakebank-postgres-data` kept.
4. **Workspace configuration** (worktree root, `docker compose config --format json`):
   - `postgres`, `demo-init`, `api` and `ui` resolve identically to `HEAD:compose.yaml`.
   - `git diff -U0 HEAD -- compose.yaml` has only two hunks, both pure insertions (`@@ -76,0 +77,43 @@`, `@@ -79,0 +123 @@`), so lines 1–76 are byte-for-byte unchanged.
   - `fakebank` ports: only `127.0.0.1:4000`. `fakebank-postgres` ports: `None`, volume `fakebank-postgres-data`.
   - `paylab-api` and `paylab-ui` are unchanged against both `HEAD` and `origin/main`.
5. **Workspace runtime.** Pre-check: `docker ps` showed only lane A's Testcontainers (random ports), and `ss -ltn` showed 3000, 3333, 4000 and 5432 free. Ran `docker compose -p paylab-t9 up --build -d` from the clean export with the new `compose.yaml`:
   - `api`, `fakebank`, `fakebank-postgres` and `postgres` healthy; `demo-init` exited successfully; `ui` started.
   - Ports: `127.0.0.1:3333`, `127.0.0.1:4000`, `127.0.0.1:3000`; both databases `5432/tcp` only.
   - `GET localhost:3000/` → `307 → /dashboard`; `/dashboard` → `200`.
   - `GET localhost:3333/health` → `{"status":"ok","app":"paylab-api",…}`.
   - `GET localhost:4000/health` → `{"status":"ok","app":"fakebank-api",…}`; `/docs` → `200`.
   - Both migrations applied on the fresh FakeBank volume.
   - Authenticated POST → `201 SUCCEEDED`, id `FBK-01a1650d-a5b9-7714-a707-bae23f1082bc`.
6. **Reload** (the same approach as `scripts/check-docker-reload.py`, done by hand on the export's `src`):
   - Replaced `app: this.envService.get('APP_NAME')` in `src/infra/http/health.controller.ts` with `'fakebank-api-reload-smoke'`. `/health` served the new name after about 3 s.
   - Restored the file. `/health` served `fakebank-api` again after about 3 s.
   - `ps` inside the container then showed a single `node … /app/dist/infra/main` (plus its `sh` wrapper), so no stale processes were left (`procps` works).
7. **Persistence.** `docker compose -p paylab-t9 stop`, then `up -d`:
   - `GET /v1/transactions/FBK-01a1650d-…` → `200` with the same body.
   - The logs say "No pending migrations to apply."
   - PayLab `/health` still `200`.
8. **Cleanup.**
   - `docker compose -p paylab-t9 down` (no `-v`).
   - Removed only the three volumes this task created for the check: `paylab-t9_postgres-data`, `paylab-t9_demo-credentials`, `paylab-t9_fakebank-postgres-data`.
   - The user's `paylab-local_*` and `paylab-production_*` volumes were never used and are untouched.
   - The shared image tag `paylab-api-dev` was rebuilt from `paylab-api` sources identical to `origin/main`. The check also created the images `paylab-t9-ui` and `fakebank-api-dev`, which were left in place.

## Validation Result

- AC-32: pass (step 3; migrations applied on a fresh volume in step 2).
- AC-33: pass (steps 4–7).
- AC-34 (documentation side): the key appears only in the two development Compose files, `.env.example` and the docs, each time labelled development-only, public and fake.

Limitation: the live worktree could not boot FakeBank while lane A's `src` had a type error. Once lane A's code compiles, the same stack works unchanged, because the Compose and image files do not depend on `src` contents.

## Decisions Made

- **Migrations run in the image command** (`migrate deploy && exec pnpm dev`), not in a separate init service as PayLab's `demo-init` does. FakeBank has no seed step, so one service is simpler. A failed migration stops the container before the app starts (`sh -e`).
- **Base image `node:22-bookworm-slim`**, matching FakeBank's Node 22 toolchain. `paylab-api` uses Node 24.
- **The standalone stack has no bind mounts**: it runs the baked image, so changes need `--build`. Reload is a workspace-stack requirement (AC-33), where `src` and `prisma` are mounted. Mounting `prisma` lets lane A's new migrations apply on the next start without a rebuild.
- **Both stacks use the image tag `fakebank-api-dev` and port 127.0.0.1:4000**, so they cannot run at the same time. This is documented.
- **The FakeBank services in the workspace stack have no dependency on PayLab services, and PayLab gets no new variables.** PayLab does not call FakeBank yet.
- `FAKEBANK_LAB_ENABLED=true` is set in both development Compose files now. It has no effect until T6 reads it.

## Follow-up Needed

- `scripts/check-docker-reload.py` still covers only PayLab. It could add a FakeBank `/health` probe like step 6. This is optional and was not done.
- When T6 lands, confirm the `FAKEBANK_LAB_ENABLED` row in `fakebank-api/PROJECT.md` matches the implementation (default, production refusal).
- The volume `fakebank-api_fakebank-postgres-data` from the standalone check remains on this machine. It is harmless and reused by the next standalone run.

## Context for Next Task

- Standalone: `cd fakebank-api && docker compose up --build`. Workspace: `docker compose up --build` at the root. Either gives FakeBank on `localhost:4000` with Client key `fakebank-dev-key-paylab-not-a-secret`.
- New environment variables must be added to both `fakebank-api/docker-compose.yml` and the `fakebank` service in the root `compose.yaml`.
- New migrations under `prisma/migrations` apply automatically on container start.

## Re-check on HEAD after the review (2026-10-23)

The original checks ran before T6–T8, so both stacks were re-run on `90aab59` (with T6–T8 and the review fixes) under throwaway Compose projects, then removed with their volumes.

- **Standalone** (`fakebank-api`, project `fakebank-s1`): built and started; all migrations, including the scenario one, applied. `/health` 200, `/docs` 200 and lists both lab routes (lab on). A `FAIL` scenario gave `201 FAILED` with `INSUFFICIENT_FUNDS`; a `DEFERRED` one gave a pending transaction that `advance` moved to `SUCCEEDED` (200); advancing again gave 409.
- **Workspace** (root, project `paylab-s1`): `postgres`, `api`, `fakebank` and `fakebank-postgres` healthy, `ui` running. PayLab answered as before (`3000` 200, `3333/health` ok) and FakeBank on 4000. `ERROR_AFTER_COMMIT` gave 500 and its replay 200; after stopping and starting FakeBank, the transaction was still listed as `SUCCEEDED` (volume kept). The PayLab services in `compose.yaml` have no removed lines since `e93777b`.
