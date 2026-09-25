# PayLab API

Backend of PayLab, a payment processing and double-entry ledger platform built as a learning lab. NestJS modular monolith on PostgreSQL, accessed through Prisma and raw SQL.

Domain language and accumulated decisions live in [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/); this file only covers how to work in the repository.

## Stack

- Node.js 20+ (CI uses 22), pnpm 11 (pinned in `package.json`; `mise.toml` provides it), TypeScript.
- NestJS 11, Zod for validation, class-validator/Swagger inherited from the base.
- PostgreSQL 16, Prisma 6 (schema and migrations), `pg`/`$queryRaw` for critical SQL paths.
- Vitest with SWC, Supertest, Testcontainers (a disposable PostgreSQL per test run).
- Biome for lint and formatting.

## Structure

| Path | Contents |
| --- | --- |
| `src/core` | Shared kernel: entities, Either/error types, repository base types |
| `src/domain/paylab` | Domain (`enterprise`) and use cases with ports (`application`) |
| `src/infra` | Nest composition: `app.module.ts`, `env`, `database` (Prisma and raw SQL adapters), `auth`, `http` (controllers, presenters, pipes, error translation), `observability` |
| `prisma/` | `schema.prisma` and hand-written SQL migrations (migrations are the source of truth) |
| `scripts/` | Operational scripts: `provision-merchant.ts`, the demo database, and the benchmark executor and importer (`benchmark-run.ts`, `benchmark-import.ts`, `benchmark/`) |
| `bench/` | Benchmark dataset generator and helpers (`lib/`), the registered scenario suite (`scenarios/`), T13/T14 experiment helpers (`exp/`), and the versioned evidence: `results/` (Run Summaries) and `baseline.json` (the Baseline pointer) |
| `test/` | `domain`, `core`, `infra` (unit), `integration`, `e2e`, `concurrency`, and `support` (Testcontainers setup, invariant helper) |
| `docs/` | PRD, task plan, task specs, task run records, ADRs; `docs/benchmark-observability/` holds the benchmark observability PRD and plan |
| `.benchmark/` | Local, gitignored benchmark Artifacts and running state (`runs/<runId>/`); never committed |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies (runs `prisma generate`) |
| `pnpm dev` | Run the API in watch mode |
| `pnpm build` / `pnpm start:prod` | Compile to `dist/` and run the build |
| `pnpm lint` / `pnpm lint:fix` | Biome check / autofix |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (no database, no Docker) |
| `pnpm test:integration` | Real PostgreSQL: repositories, Settlement, schema and trigger tests |
| `pnpm test:e2e` | HTTP API against the Testcontainers database |
| `pnpm test:concurrency` | Parallel-connection suite, run separately from the fast gate |
| `pnpm prisma:migrate` | Create/apply a migration in development |
| `pnpm prisma:migrate:deploy` | Apply existing migrations |
| `pnpm merchant:provision "<name>"` | Create a Merchant and print its API key once |
| `pnpm demo:seed` | Create the separate `paylab_demo` database, migrate it and fill it with demo data (insert-only, refuses to run twice); prints two Merchant API keys once |
| `pnpm demo:dev` | Run the API against the demo database |
| `pnpm demo:reset -- --yes` | Drop the demo database (the only destructive demo command) |
| `pnpm bench:up` / `bench:migrate` / `bench:seed` / `bench:validate` | Separate benchmark database (port 5433): start, migrate, load the skewed dataset, check it |
| `pnpm bench:template` | Snapshot the validated benchmark database as the pristine template every Run restores from |
| `pnpm bench:targets` / `bench:explain` | Pick hot and cold ids; capture `EXPLAIN (ANALYZE, BUFFERS)` plans |
| `pnpm benchmark:run [--note "<why>"]` | Run the complete Benchmark Suite from a clean commit and publish a Run Summary. Destructive to the benchmark database; long (about two hours); never in CI |
| `pnpm benchmark:import` | One-time, idempotent import of the T13 and T14 evidence as Imported Benchmark Runs |

Benchmark guide (dataset, publishing Runs, reading them): [docs/benchmark.md](docs/benchmark.md). Results: [docs/experiments/T13-results.md](docs/experiments/T13-results.md) and [docs/experiments/T14-results.md](docs/experiments/T14-results.md).

## Local setup

1. `pnpm install`
2. `cp .env.example .env`
3. `docker compose up -d postgres`, then `pnpm prisma:migrate:deploy`
4. `pnpm dev`, then `curl localhost:3333/health`

Docker is required for every database test layer (integration, e2e, concurrency). Unit tests need no Docker. The developer walkthrough is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Environment variables

Validated at boot by `src/infra/env/env.ts`; defaults in `.env.example`. Real `.env` files are gitignored, and secrets are never committed.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL |
| `PORT` | Default 3333 |
| `NODE_ENV` | `development`, `test` or `production` |
| `APP_NAME`, `LOG_ENABLED`, `LOG_LEVEL` | Structured logging (`basic` or `debug`) |
| `FRONTEND_URL` | Comma-separated CORS origins; required in production |
| `BENCH_DATABASE_URL` | Benchmark database (default port 5433). Must be local, its name must contain `bench`, and it is never `DATABASE_URL`; `benchmark:run` drops and recreates it |
| `BENCH_TEMPLATE_DATABASE` | Optional. Pristine copy the benchmark database is restored from (default `<database>_template`) |
| `BENCH_SUMMARY_DIR`, `BENCH_BASELINE_FILE` | Optional. Versioned Run Summaries (default `bench/results`) and the Baseline pointer (default `bench/baseline.json`) |
| `BENCH_ARTIFACT_ROOT` | Optional. Local, gitignored Artifacts and running state (default `.benchmark`) |
| `BENCHMARK_ENABLED` | Benchmark read API (`/v1/benchmarks`): on by default only when `NODE_ENV=development`; the API refuses to start with it enabled in production |
| `DEMO_DATABASE_URL` | Used only by the `demo:*` commands. Must be a local host and a database name containing `demo`; never `DATABASE_URL` |

Tests ignore a developer `.env`: they apply their own defaults and the Testcontainers URL.

## Testing layers

Unit, integration, e2e and concurrency, each with its own Vitest config (`vitest.config.*.ts`). Database layers run serially against one container and reset data between tests; after every database test in the integration and concurrency layers the global invariant check (`test/support/invariants.ts`) runs. Write the failing test first.

## Conventions

- Layering follows the reference architecture: `enterprise` (pure domain), `application` (use cases and ports), `infra` (adapters). Domain code never imports infra.
- Use cases return `Either`; HTTP errors are produced by the error-translation layer.
- Critical SQL (Settlement, balance, keyset reads) is raw SQL inside interactive transactions; everything else uses Prisma.
- Migrations are hand-reviewed SQL; never regenerate the baseline without carrying over triggers and hand-written constraints.
- Files are UTF-8 without BOM; code, docs and commit messages are in English. Commit messages follow `type: summary` (feat, fix, chore, docs, refactor, test, ci).
- One task at a time through the workflow: PRD, task plan, TDD.
- The sibling `../petagro-api` is a gitignored, read-only structural reference; never modify it or copy its business code.

## CI

`.github/workflows/ci.yml`: `typecheck`, `lint` and `tests` (unit, integration, e2e) form the fast gate; `concurrency` is a separate, non-blocking job. `pr-guard.yml` requires a conventional PR title and the Summary, Validation, Deploy and Rollback sections; `dependency-review.yml` requires a lockfile update when dependencies change.

## Sources of truth

- Scope and acceptance criteria: [docs/PRD.md](docs/PRD.md)
- Plan and progress ledger: [docs/TASKS.md](docs/TASKS.md); specs in `docs/tasks/`, run records in `docs/task-runs/`
- Domain language and project memory: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)
- Benchmark observability: [PRD](docs/benchmark-observability/PRD.md), [plan](docs/benchmark-observability/TASKS.md), storage decision [ADR 0011](docs/adr/0011-version-benchmark-summaries-and-retain-artifacts-locally.md); operating guide in [docs/benchmark.md](docs/benchmark.md)
