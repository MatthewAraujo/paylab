# PayLab workspace

This workspace contains three applications: the NestJS API (`paylab-api`), the Next.js Operational Console (`paylab-ui`), and FakeBank (`fakebank-api`), a standalone NestJS provider simulator that PayLab will call over HTTP (it does not yet). Each application's `PROJECT.md` describes its stack, commands, conventions and CI.

## Local Docker development

Requires Docker Engine with Docker Compose. From this directory:

```sh
docker compose up --build
```

- Console: http://localhost:3000
- API health: http://localhost:3333/health
- API documentation: http://localhost:3333/docs
- FakeBank health: http://localhost:4000/health
- FakeBank documentation: http://localhost:4000/docs

First startup installs dependencies inside images, waits for PostgreSQL, applies existing migrations and seeds the demo dataset. The console authenticates automatically as Demo Store. All three applications run in development mode; editing files under their `src` directories triggers reload. API scripts, Prisma files and benchmark evidence are also mounted. Configuration, dependency, or Dockerfile changes require rerunning the command with `--build`.

Use `docker compose up --build -d` for background execution and `docker compose logs -f api ui fakebank` for logs. `docker compose stop` stops the stack while preserving containers and volumes. Running the startup command again preserves demo data and credentials.

The `paylab-local` Compose project has dedicated PostgreSQL and credential volumes. PostgreSQL has no host port; it does not use the existing API Compose database or host data directory. The host ports 3000, 3333 and 4000 must be available. Only the local machine can access the published application ports.

The initializer runs once before the API on each Compose startup. Existing demo data is not reseeded. The generated Merchant key stays in a private Docker volume and is mounted read-only in the console. Treat that volume as a credential; retain it with the database volume. If they do not match, initialization fails rather than deleting data. A process interruption after seeding but before saving the key also requires credential recovery; it never triggers an automatic reset.

Financial server requests use `PAYLAB_INTERNAL_API_URL=http://api:3333`; browser health and benchmark requests use `NEXT_PUBLIC_PAYLAB_API_URL=http://localhost:3333`. No host `.env` file is needed or copied into the images. This setup is for local development only.

Benchmark evidence already on disk is visible through bind mounts. The API reads host diagnostic Artifacts through a read-only repository mount, so Docker does not create or change ownership of the host `.benchmark` directory. The stack never starts a benchmark workload or a benchmark database. Existing standalone commands and Compose configuration inside `paylab-api` and `fakebank-api` remain independent.

### FakeBank in the development stack

`fakebank` and `fakebank-postgres` run next to PayLab without depending on it: FakeBank has its own PostgreSQL (no host port) and its own `fakebank-postgres-data` volume, and the PayLab services receive no FakeBank configuration. On each start the container applies FakeBank's migrations, then runs `pnpm dev`; `fakebank-api/src` and `fakebank-api/prisma` are mounted, so source edits reload the service and new migrations apply on the next start. FakeBank listens on 127.0.0.1:4000 only, the same port as its standalone stack in `fakebank-api` (run one at a time).

The stack configures one development Client, `paylab`, whose key is `fakebank-dev-key-paylab-not-a-secret`. The key is public and fake, it appears only in the development Compose files and `fakebank-api/.env.example`, and it must never be used in another environment (generate a random key there and hash it with `pnpm client-key:hash`). The lab surface is enabled (`FAKEBANK_LAB_ENABLED=true`, development only). Example:

```sh
curl -X POST localhost:4000/v1/transactions \
  -H 'Authorization: Bearer fakebank-dev-key-paylab-not-a-secret' \
  -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' \
  -d '{"externalReference":"payment-1","amountMinor":1500,"currency":"BRL"}'
```

## Production-local Docker

Runs compiled, non-root images the way a release would, on this machine only. From this directory:

```sh
cp .env.production.example .env.production   # then replace every value; keep it private
docker compose -f compose.production.yaml up --build -d
```

- Console: http://localhost:3000
- API health: http://localhost:3333/health (no `/docs`: Swagger and the benchmark API are off in production, so the console's Benchmarks area shows them as unavailable)

`.env.production` is gitignored and required; without it Compose stops before starting anything. It holds the PostgreSQL user and password and the matching `DATABASE_URL` (URL-encode the password there; host `postgres` and database `paylab_demo` are fixed by the demo initializer). Nothing secret is passed as a build argument.

On every startup the one-shot `demo-init` applies versioned migrations, then seeds the Demo Store only when the database is empty. The API starts only after it succeeds, and the console only after the API is healthy, so a failed migration or initialization keeps both unavailable (`docker compose -f compose.production.yaml logs demo-init` shows why). PostgreSQL, API and console have healthchecks and `restart: unless-stopped`: Docker restarts a process that exits, but not one that is merely unhealthy.

The `paylab-production` Compose project has its own `postgres-data` and `credentials` volumes, separate from development. The Merchant key stays in the credential volume, mounted read-only in the console. Keep the two volumes together; a mismatch fails initialization rather than resetting data.

Logs: `docker compose -f compose.production.yaml logs -f api ui`. Stop: `docker compose -f compose.production.yaml stop`. Rebuild after code or dependency changes by rerunning the startup command. Both stacks publish 127.0.0.1:3000 and 127.0.0.1:3333, so stop one before starting the other. `python3 scripts/check-production-stack.py` verifies a running stack; `--restart` and `--kill` additionally check preservation across a restart and recovery after a crash.

### Backup and restore

Backups are manual compressed dumps in the gitignored `backups/` directory, taken while the stack runs:

```sh
mkdir -p backups
docker compose -f compose.production.yaml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d paylab_demo --format=custom' > backups/paylab-$(date +%Y%m%d-%H%M%S).dump
```

Restoring **replaces the current database contents** with the dump; anything written after it is lost. Take a fresh backup first, then stop the API and console before restoring, never restore into a running application:

```sh
docker compose -f compose.production.yaml stop ui api
docker compose -f compose.production.yaml exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d paylab_demo --clean --if-exists --single-transaction --no-owner' < backups/<file>.dump
docker compose -f compose.production.yaml up -d --wait
```

A dump does not contain the Merchant key, only its hash. Restore a dump from this stack with its own credential volume; a dump from another stack also needs that stack's credential volume, or initialization refuses to start.

## Specifications

- FakeBank October MVP (standalone provider simulator): [PRD](fakebank-api/docs/PRD.md), [context](fakebank-api/CONTEXT.md).
- Local Docker: [PRD](docs/local-docker/PRD.md), [tasks](docs/local-docker/TASKS.md).
- Production-local Docker: [PRD](docs/production-docker/PRD.md), [tasks](docs/production-docker/TASKS.md).
- Benchmark observability: [PRD](docs/PRD.md), [tasks](docs/TASKS.md).

## Docker reload regression

With the stack running, `python3 scripts/check-docker-reload.py` checks both development servers through HTTP. This optional validation needs Python 3, temporarily edits the API health response and console home redirect, and restores both source files. It catches process cleanup failures that a startup-only health check misses.
