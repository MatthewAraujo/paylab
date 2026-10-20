# PayLab workspace

This workspace contains the NestJS API (`paylab-api`) and Next.js Operational Console (`paylab-ui`). Each repository's `PROJECT.md` describes its stack, commands, conventions and CI.

## Local Docker development

Requires Docker Engine with Docker Compose. From this directory:

```sh
docker compose up --build
```

- Console: http://localhost:3000
- API health: http://localhost:3333/health
- API documentation: http://localhost:3333/docs

First startup installs dependencies inside images, waits for PostgreSQL, applies existing migrations and seeds the demo dataset. The console authenticates automatically as Demo Store. Both applications run in development mode; editing files under their `src` directories triggers reload. API scripts, Prisma files and benchmark evidence are also mounted. Configuration, dependency, or Dockerfile changes require rerunning the command with `--build`.

Use `docker compose up --build -d` for background execution and `docker compose logs -f api ui` for logs. `docker compose stop` stops the stack while preserving containers and volumes. Running the startup command again preserves demo data and credentials.

The `paylab-local` Compose project has dedicated PostgreSQL and credential volumes. PostgreSQL has no host port; it does not use the existing API Compose database or host data directory. The host ports 3000 and 3333 must be available. Only the local machine can access the published application ports.

The initializer runs once before the API on each Compose startup. Existing demo data is not reseeded. The generated Merchant key stays in a private Docker volume and is mounted read-only in the console. Treat that volume as a credential; retain it with the database volume. If they do not match, initialization fails rather than deleting data. A process interruption after seeding but before saving the key also requires credential recovery; it never triggers an automatic reset.

Financial server requests use `PAYLAB_INTERNAL_API_URL=http://api:3333`; browser health and benchmark requests use `NEXT_PUBLIC_PAYLAB_API_URL=http://localhost:3333`. No host `.env` file is needed or copied into the images. This setup is for local development only.

Benchmark evidence already on disk is visible through bind mounts. The API reads host diagnostic Artifacts through a read-only repository mount, so Docker does not create or change ownership of the host `.benchmark` directory. The stack never starts a benchmark workload or a benchmark database. Existing standalone commands and Compose configuration inside `paylab-api` remain independent.

## Specifications

- FakeBank October MVP (standalone provider simulator): [PRD](fakebank-api/docs/PRD.md), [context](fakebank-api/CONTEXT.md).
- Local Docker: [PRD](docs/local-docker/PRD.md), [tasks](docs/local-docker/TASKS.md).
- Benchmark observability: [PRD](docs/PRD.md), [tasks](docs/TASKS.md).

## Docker reload regression

With the stack running, `python3 scripts/check-docker-reload.py` checks both development servers through HTTP. This optional validation needs Python 3, temporarily edits the API health response and console home redirect, and restores both source files. It catches process cleanup failures that a startup-only health check misses.
