# T9 Context

## Task

Run FakeBank with one Docker Compose command on its own (`fakebank-api/docker-compose.yml`), and add `fakebank` plus `fakebank-postgres` to the workspace development stack (`compose.yaml` at the workspace root) without changing the PayLab services. Document both in the workspace `PROJECT.md` and `fakebank-api/PROJECT.md`. Spec: [T9](../tasks/T9.md). Runs in lane B, in parallel with T4–T8 (lane A owns `src`, `test`, `prisma`).

## Related PRD Acceptance Criteria

- AC-32: from `fakebank-api`, one Compose command starts FakeBank and its own PostgreSQL, applies migrations, and `/health` and `/docs` answer on port 4000.
- AC-33: the workspace stack starts FakeBank and a dedicated PostgreSQL alongside PayLab; FakeBank on `127.0.0.1:4000`, its database not published, own volume, source edits reload; PayLab services and behavior unchanged.
- AC-34 (documentation side): development key defaults documented and confined to development configuration.

## Relevant Prior Summaries

- T1: pnpm 11.9.0 is required (`packageManager`); `pnpm dev` is `nest start --watch`; `/health` is liveness only; Swagger is served in every environment; `tsBuildInfoFile` lives in `dist`.
- T3: migrations apply with `pnpm prisma:migrate:deploy`. Required env `DATABASE_URL`, `FAKEBANK_CLIENTS`; optional `PORT` (4000), `NODE_ENV`, `APP_NAME`, `LOG_ENABLED`, `LOG_LEVEL`. T6 adds `FAKEBANK_LAB_ENABLED` (default false). Development key `fakebank-dev-key-paylab-not-a-secret`, hash `5489e8238a869fd3a7d6c634818fca30656b25435dd903860d123236437a576a` (public and fake, as in `.env.example`).

## Files Likely Affected

- `fakebank-api/Dockerfile`, `fakebank-api/.dockerignore`, `fakebank-api/docker-compose.yml` (new).
- `compose.yaml` (workspace root): append two services and one volume.
- `PROJECT.md` (workspace root), `fakebank-api/PROJECT.md`.
- This file and `T9-summary.md`.

## Test-First Plan

No automated layer covers Compose in this workspace; validation is the documented manual commands, each recorded in the summary:

1. Before building: read every script the image runs (`postinstall: prisma generate`, `dev`, `prisma:migrate:deploy`).
2. AC-32: `docker compose up --build -d` in `fakebank-api`; `curl` `/health`, `/docs`, and an authenticated `POST /v1/transactions` with the development key; `docker compose down` (volumes kept).
3. AC-33 configuration: `docker compose config` at the root shows FakeBank published only on `127.0.0.1:4000` and no ports on `fakebank-postgres`.
4. AC-33 PayLab unchanged: diff of the PayLab service blocks against `HEAD` is empty.
5. AC-33 runtime (only when ports 3000/3333/4000/5432 and the containers are free): root `up --build -d`; PayLab `3000` and `3333/health` answer; FakeBank on `4000`; touching a FakeBank source file restarts the app; `stop` then `up` keeps a created transaction; `docker compose down` (no `-v`).

## Constraints

- Lane path boundary: only the files listed above. Commit with explicit paths.
- PayLab services (`postgres`, `demo-init`, `api`, `ui`) byte-for-byte unchanged; PayLab gets no new variables.
- Never `down -v`, prune, or remove containers/volumes this task did not create; never stop the user's containers.
- Development key only in development Compose files and docs, marked as such.

## Risks

- Lane A edits `src` while the stack runs: watch mode may reload on their edits or fail to compile mid-edit; that is not a Compose defect.
- Nest watch needs `ps` (procps) to kill the previous process tree, otherwise reloads leave stale processes (workspace reload note).
- Both stacks publish `127.0.0.1:4000`; only one can run at a time.
- `postinstall` downloads Prisma engines during the image build (network access at build time).

## Definition of Done

Both Compose commands start healthy stacks (or the root runtime check is recorded as not run with the reason), the manual checks are recorded in `T9-summary.md`, the PayLab service blocks are unchanged, documentation updated, one commit containing only lane B paths.
