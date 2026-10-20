# T1 Summary

## Status
Completed. AC-1 through AC-5 validated against the running Docker stack.

## What Changed
Added development Dockerfiles for both applications and one root Compose command for PostgreSQL, migration/demo initialization, API and UI. Demo data and the server-only Merchant credential persist in dedicated volumes. Existing standalone databases and Compose configuration remain independent. Server reads can use an internal API address while browser reads retain localhost.

## Files Changed
Root compose.yaml, README.md, PROJECT.md, scripts/check-docker-reload.py, and this scoped specification/plan/run record; both Dockerfiles and .dockerignore files; API Docker initializer, PROJECT.md and CONTEXT.md; UI server client, its regression test and PROJECT.md.

## Tests Added or Updated
- UI server-client regression: internal URL routing and explicit override precedence.
- HTTP reload regression for API source changes, console redirect changes, and source restoration. The initial API probe failed with EADDRINUSE; installing procps alone fixed it, and the final rebuilt image passed both probes.
- Runtime initializer checks: empty database plus saved credential, wrong target database, seeded database without a credential, and seeded database with an incorrect credential all fail explicitly without resets.

## Commands Run
- `docker compose config --quiet`
- `docker compose up --build -d --wait`
- `docker compose run --rm --no-deps api pnpm typecheck`
- `docker compose run --rm --no-deps api pnpm lint`
- `docker compose run --rm --no-deps api pnpm test test/scripts/demo-guard.spec.ts test/scripts/demo-plan.spec.ts`
- `docker compose run --rm --no-deps ui pnpm exec vitest run src/api/server-client.test.ts`
- `docker compose run --rm --no-deps ui pnpm test`
- `docker compose run --rm --no-deps ui pnpm typecheck`
- `docker compose run --rm --no-deps ui pnpm lint`
- `python3 scripts/check-docker-reload.py`
- `docker compose stop`, followed by `docker compose up --build -d --wait`
- HTTP smoke scripts for authenticated account reads, rendered Wallet identities, absence of the key from HTML, home redirect, benchmark availability and CORS; compared all six Wallet ids before and after restart.
- `git diff --check`

## Validation Result
Both images build; all three existing migrations apply; initial seed creates 174 Payments. API health and real authenticated UI account reads succeed. UI: 467 tests pass. API demo tests: 21 pass. Both typechecks and linters exit successfully; UI lint reports four existing reduced-motion CSS warnings. Both HTTP reload probes pass on the final image. Full stop/start preserves all six Demo Store Wallet ids and authentication, and initialization reports existing data/credential preservation. Standards and Spec reviews have no remaining findings.

Initial downloads suffered registry timeouts. pnpm package caches, bounded request concurrency and a longer fetch timeout allowed successful builds without changing lockfiles or bypassing supply-chain policies. These network failures occurred before application startup.

## Decisions Made
- Development mode preserves the local benchmark capability without running benchmark workloads.
- PostgreSQL publishes no host port; API and UI publish loopback-only ports.
- Host demo guards are unchanged. A separate Docker initializer accepts only the Compose database target.
- Missing/mismatched credentials fail without destroying or reseeding data. The documented crash window between seed commit and credential persistence requires recovery rather than automatic reset.
- Nest watch requires ps for child process cleanup; the slim image therefore includes procps. This was confirmed by a failing HTTP reload loop and a successful single-variable fix.
- Artifact reads use a read-only repository mount so Docker does not create a root-owned host artifact directory.

## Follow-up Needed
None for this scope. Production deployment and benchmark execution remain out of scope. Broad financial database suites and browser automation were not rerun; this change was validated with existing UI tests, focused API tests, actual PostgreSQL initialization and HTTP smoke checks.

## Context for Next Task
The stack remains running on localhost:3000 and localhost:3333. Use PROJECT.md for operation. Database and credential volumes must be retained together. No PR was requested or opened. Unrelated files appearing during this session were left untouched.
