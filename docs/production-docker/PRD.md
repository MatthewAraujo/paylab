# PRD — Production-local Docker

## Problem Statement
The only container setup runs both applications in development mode: single-stage images built with every tool, running as root, with source mounts and hot reload. There is no way to run PayLab locally the way it would run in production (compiled builds, minimal non-root images, migrations as a release step, restart and health policies, real secrets kept out of the repository, and a backup procedure) without giving up the development workflow.

## Solution
A second, independent Compose file starts a production-local stack with `docker compose -f compose.production.yaml up --build -d`. It builds multi-stage production images for the API and the Operational Console, runs them as non-root users, applies versioned migrations and the existing Demo Store initialization before the API becomes available, keeps data and the Merchant credential in volumes that are separate from development, reads real values from a gitignored `.env.production`, and documents manual PostgreSQL backups and a stop-first restore. The root `compose.yaml` and its development behavior stay as they are.

## User Stories
1. As a developer, I want the existing `docker compose up --build` development stack to keep its hot reload, demo data and volumes, so that adding production-local infrastructure costs me nothing day to day.
2. As a developer, I want one command to start a production-local stack, so that I can exercise compiled builds without host tooling.
3. As a developer, I want the production-local stack reachable only from my machine, so that running it never exposes the API, console or database on my network.
4. As a developer, I want the production-local stack to use its own database and credential volumes, so that it never reads, changes or reseeds my development data.
5. As a developer, I want the first production-local startup to apply migrations and create the Demo Store data automatically, so that the console shows authenticated data without manual steps.
6. As a developer, I want later startups to preserve the database and credential instead of reseeding, so that my production-local state survives restarts and rebuilds.
7. As a developer, I want initialization to fail rather than reset when the database and credential volumes disagree, so that no data is silently destroyed.
8. As an operator, I want versioned migrations to run on every release startup before the API serves traffic, so that the API never runs against an out-of-date schema.
9. As an operator, I want a failed migration or initialization to keep the API and console unavailable, so that a broken release does not serve requests.
10. As a security-minded developer, I want final images to contain only runtime artifacts and production dependencies, so that compilers, package managers and dev tooling are not part of the attack surface or the image size.
11. As a security-minded developer, I want the API and console to run as non-root users, so that a compromised process has fewer privileges.
12. As an operator, I want PostgreSQL, the API and the console to report health, so that dependants start only when their dependency is ready and I can see the stack's state.
13. As an operator, I want long-running services to restart automatically after a crash, so that a transient failure recovers without my intervention.
14. As a security-minded developer, I want the Merchant API key to stay server-side, readable only by the console server and never in the browser, the repository, image layers or build arguments.
15. As a developer, I want a tracked example environment file with names and safe example values, so that I know exactly which values to provide.
16. As a developer, I want real values in a gitignored `.env.production`, so that secrets never reach git.
17. As a developer, I want a clear error when `.env.production` is missing, so that I don't start a stack with default passwords.
18. As an operator, I want a documented command that creates a compact PostgreSQL dump in a gitignored `backups/` directory, so that I can keep restore points.
19. As an operator, I want a documented restore procedure that requires stopping the stack first and states that it replaces current data, so that I don't restore into a live system or lose data by surprise.
20. As a developer, I want documentation explaining startup, addresses, logs, shutdown, rebuilds, the dev/production-local port conflict, backup and restore, so that I can operate the stack without reading the Compose file.

## Acceptance Criteria
- **AC-1** (story 1): The root `compose.yaml` and the development Dockerfiles keep their behavior: `docker compose config --quiet` passes, the development stack still starts in development mode with source reload (`scripts/check-docker-reload.py` passes), and it keeps its existing project name and volumes.
- **AC-2** (stories 2, 3): `docker compose -f compose.production.yaml config --quiet` passes and `docker compose -f compose.production.yaml up --build -d` starts PostgreSQL, the initializer, the API and the console. The API and console publish ports only on `127.0.0.1` (3333 and 3000); PostgreSQL publishes no host port.
- **AC-3** (story 4): The production-local stack uses its own Compose project and its own named PostgreSQL data and credential volumes, distinct from the development volumes; starting or stopping either stack does not change the other's volumes.
- **AC-4** (story 5): On first startup with empty volumes, migrations are applied and the Demo Store data is seeded; the console renders authenticated Demo Store data and the API answers authenticated requests with the generated key.
- **AC-5** (story 6): Stopping and starting the stack again (including `--build`) preserves the Demo Store Wallet ids and the credential, and the initializer reports that existing data was preserved without reseeding.
- **AC-6** (story 7): If the credential volume and the database volume do not match, initialization fails explicitly and changes no data; the API and console do not start.
- **AC-7** (stories 8, 9): On every startup, versioned migrations run before the API starts. If migration or initialization fails, the API and console stay unavailable.
- **AC-8** (story 10): The final API image contains the compiled application and production dependencies only (no TypeScript compiler, Nest CLI, ts-node, Prisma CLI, test tooling or pnpm). The final console image contains the Next.js standalone output only (no source tree, dev dependencies or pnpm).
- **AC-9** (story 11): Inside the running API and console containers, the application processes run with a non-zero user id.
- **AC-10** (story 12): PostgreSQL, API and console define healthchecks and report `healthy`; the API waits for successful initialization and the console waits for a healthy API.
- **AC-11** (story 13): PostgreSQL, API and console use `restart: unless-stopped`; the initializer has no restart policy. When the API or console process exits unexpectedly, Docker restarts it and it becomes healthy again.
- **AC-12** (story 14): The Merchant key lives only in the production-local credential volume, is mounted read-only into the console, is absent from the rendered HTML and browser bundles, and does not appear in tracked files, image layers or build arguments.
- **AC-13** (stories 15, 16, 17): `.env.production` is gitignored; a tracked `.env.production.example` lists every required name with safe example values only; starting the stack without `.env.production` fails before any container starts, with a message naming the missing file.
- **AC-14** (story 18): A documented command produces a compact PostgreSQL dump inside a gitignored `backups/` directory while the stack is running.
- **AC-15** (story 19): The documented restore procedure stops the API and console before restoring, states that the restore replaces current database contents, and keeps the credential volume consistent with the restored data.
- **AC-16** (story 20): Workspace documentation covers startup, addresses, logs, shutdown, rebuilds, the port conflict with the development stack, environment setup, backup and restore.

## Implementation Decisions
- **Separate production Dockerfiles.** Each repository gets its own multi-stage production Dockerfile next to the existing development one. The development Dockerfiles and the root `compose.yaml` are not modified, which is how AC-1 is preserved. Both files share the existing `.dockerignore`, which already keeps `.env*`, build output and local data out of the build context.
- **API production image.** Stages: install with frozen lockfile (pinned pnpm from `packageManager`), compile with `nest build`, produce production-only dependencies with a generated Prisma Client, and a final runtime stage on the same Node base with OpenSSL that holds only compiled output, production dependencies and the Prisma schema. It runs `node dist/infra/main` with `NODE_ENV=production`.
- **Initializer image target.** Migrations need the Prisma CLI and the existing Docker demo initializer runs through ts-node, so the one-shot initializer uses a separate build target of the API production Dockerfile that keeps the install-stage tooling. It is not a final runtime image and does not serve traffic. It runs `prisma migrate deploy` followed by the unchanged Docker demo initializer on every startup.
- **Initializer unchanged.** The production-local stack reuses the Compose service name `postgres` and database `paylab_demo`, which is what the existing initializer's target guard accepts. Its mismatch refusals and its `0600` key file are kept as they are. Isolation comes from a separate Compose project name and separate named volumes, not from a different database name.
- **One unprivileged user.** API, console and initializer all run as the official image's `node` user (uid 1000). The credential directory is created in the image owned by that user, so a new named volume inherits that ownership; the initializer writes the `0600` key and the console reads it read-only as the same user. PostgreSQL keeps its official image behavior.
- **Console production image.** Next.js standalone output is enabled only when the production build requests it through a build-time environment switch, so `pnpm build`/`pnpm start` and development keep their current behavior. The final stage copies the standalone server, static assets and nothing else, and starts with `node server.js` bound to `0.0.0.0`. The browser API address uses the code default `http://localhost:3333`; server reads use `PAYLAB_INTERNAL_API_URL=http://api:3333` at runtime. The key is read from the credential volume at container start and exported only to the server process.
- **Production API configuration.** `NODE_ENV=production` disables Swagger and the benchmark read API (existing behavior; the console's Benchmarks area shows the capability as unavailable). `FRONTEND_URL=http://localhost:3000` satisfies the fail-closed CORS check.
- **Environment.** Services that need real values load `.env.production` through a required service-level env file, so a missing file stops Compose before startup. It holds the PostgreSQL user, password and database and the matching `DATABASE_URL` (the password must be URL-encoded there). `.env.production` and `backups/` are added to the root `.gitignore`.
- **Health and ordering.** PostgreSQL uses `pg_isready`; the API probes `/health`; the console probes its home route without following the redirect and treats any non-error status as healthy. The initializer waits for healthy PostgreSQL; the API waits for `service_completed_successfully` of the initializer; the console waits for a healthy API.
- **Restart policy.** `restart: unless-stopped` on PostgreSQL, API and console. Docker restarts exited containers; it does not restart containers that are merely unhealthy. That limitation is documented, not worked around.
- **Ports.** Same loopback ports as development (3000, 3333), because the browser API address is compiled into the console bundle. The development and production-local stacks therefore cannot run at the same time; this is documented.
- **Backups.** Manual: `pg_dump` in custom (compressed) format through the running PostgreSQL container into `./backups/` on the host. Restore: stop API and console, `pg_restore --clean --if-exists` into the database, start the stack again. The dump contains the stored hash of the Demo Store key, so a dump from this stack stays consistent with its credential volume; restoring a dump from another stack requires that stack's credential too.

## Testing Decisions
- **One seam: the Compose/HTTP/container boundary of the production-local stack.** Every AC is checked from outside: Compose configuration and status, HTTP responses from API and console, `docker compose exec` for user ids and absent tools, and volume listings. No tests assert Dockerfile or Compose text.
- **Repeatable smoke check.** A workspace script, following the existing `scripts/check-docker-reload.py` precedent (Python 3, standard library only, HTTP + `docker compose` subprocess calls), checks a running production-local stack: health of the three services, loopback-only ports, non-root processes, absence of build tools in final images, authenticated API read, rendered console data without the key in the HTML, and preservation of Wallet ids across a restart. Checks that kill a process or restart the stack are opt-in flags. It never removes volumes.
- **One-off manual evidence** recorded in the task run summary: missing `.env.production` failure, credential/database mismatch failure using throwaway volumes, migration failure keeping API and console down, backup creation and a restore drill.
- **Development regression.** `docker compose config --quiet` and `scripts/check-docker-reload.py` against the development stack, plus the existing API/UI typecheck, lint and test commands, which must not change because of the conditional standalone output.

## Out of Scope
Reverse proxy, public domain, TLS, console login, remote hosting or CI/CD deployment, image registries, automated or scheduled backups, credential rotation, changes to the demo initializer's rules, benchmark execution, database resets, changes to financial behavior, and running both stacks at once.

## Further Notes
Grilling was completed in a previous session and its approved decisions are recorded in `docs/infra-production-handoff.md`. User-owned untracked learning materials in the workspace root must be preserved. ai-memory held no further decisions for this scope.
