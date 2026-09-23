# PayLab API

Backend of PayLab, a fictional payment processing and double-entry ledger platform built as a learning lab. NestJS modular monolith on PostgreSQL.

## Current State

Technical spine only (T1 done). The base was pruned from the reference architecture (`../petagro-api`, gitignored, read-only) to Nest bootstrap, env validation, structured logging, security headers, the error-translation mechanism, Zod pipes and a `GET /health` endpoint. There is no database code, schema or business logic yet; the app boots without PostgreSQL.

This file is a stub and is rewritten in T15.

## Sources of truth

- Scope and acceptance criteria: [docs/PRD.md](docs/PRD.md)
- Plan and progress ledger: [docs/TASKS.md](docs/TASKS.md) (start with the first `ready` task; specs in `docs/tasks/`)
- Domain language: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/) (0001 to 0004)
- Product source: the PayLab page in the Notion workspace, section "September — financial core + PostgreSQL"

## Working rules

- Follow the workflow in the user's global instructions: PRD, then task plan, then TDD, one task at a time through `task-runner`.
- The reference project (`../petagro-api`) is a guide for layering and conventions only. Never modify it and never copy its business code.
- Docker is required for the test suites (Testcontainers).
