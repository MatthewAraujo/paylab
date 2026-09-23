# Developer guide

From a clean clone to a green test run and a running app. Command reference and conventions are in [PROJECT.md](../PROJECT.md).

## Prerequisites

- Node.js 20 or newer (22 recommended) and pnpm 11 (`corepack enable` or `mise install`).
- **Docker**, running. The integration, e2e and concurrency suites start a `postgres:16-alpine` container through Testcontainers and stop it afterwards; nothing else needs to be installed or running. Unit tests do not need Docker.

## 1. Install and verify

```bash
cd paylab-api
pnpm install
pnpm lint
pnpm typecheck
pnpm test               # unit
pnpm test:integration   # needs Docker
pnpm test:e2e           # needs Docker
pnpm test:concurrency   # needs Docker; slower, run separately in CI
```

No `.env` is needed for tests. If Docker is not running, the database layers fail at container start.

## 2. Run the app

```bash
cp .env.example .env
docker compose up -d postgres
pnpm prisma:migrate:deploy
pnpm dev
curl http://localhost:3333/health
```

The compose database persists under `./data/pg` (gitignored). Stop it with `docker compose down`.

## 3. Create a Merchant

```bash
pnpm merchant:provision "Acme Ltda"
```

The API key is printed once and only its hash is stored. Use it as `Authorization: Bearer <key>` on Merchant endpoints.

## Working on a change

1. Read the task spec in `docs/tasks/` and the linked PRD stories.
2. Write the failing test in the right layer, then the minimum code.
3. Run `pnpm lint`, `pnpm typecheck` and the affected test layers.
4. Open a pull request titled `type: summary` with the Summary, Validation, Deploy and Rollback sections (the template provides them).

## Migrations

Migrations in `prisma/migrations` are the source of truth and include hand-written SQL (constraints, triggers). Do not let `prisma migrate dev` regenerate the baseline; add a new migration and review its SQL.
