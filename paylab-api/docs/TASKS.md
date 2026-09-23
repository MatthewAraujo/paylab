# Tasks

## Source Context

- PRD: [docs/PRD.md](PRD.md) (September — financial core + PostgreSQL). Acceptance criteria are its numbered user stories, referenced below as `US-n`.
- Glossary: [CONTEXT.md](../CONTEXT.md).
- ADRs: [0001 settle atomically](adr/0001-post-ledger-and-settle-payment-atomically.md), [0002 source lock](adr/0002-exclusive-source-lock-for-balance-consumers.md), [0003 database integrity](adr/0003-ledger-integrity-enforced-in-the-database.md), [0004 Prisma plus raw SQL](adr/0004-prisma-for-schema-raw-sql-for-critical-paths.md).
- Reference architecture (read-only, gitignored): the sibling `petagro-api` project — layering, Either pattern, controller and Zod pipe conventions, error translation, observability, test tooling.
- Current `PROJECT.md` is the reference project's and is replaced in T15.

## Implementation Goal

Deliver the September core of PayLab: a NestJS and PostgreSQL modular monolith with a double-entry, append-only ledger enforced by the database, idempotent Payments settled synchronously under a source-Wallet lock, Merchant-scoped keyset-paginated reads, and a reproducible skewed benchmark dataset with documented index, pagination and concurrency experiments.

## Non-Goals

React front end, FakeBank and provider integration, webhooks, reconciliation, queues, workers, Outbox, Redis, reserve-on-processing and hold Accounts, refunds and reversals, multi-currency, materialized balances (unless measured and only as a proposal), Merchant self-service, Better Auth and user login, Docker production image and cloud deployment, metrics, tracing and rate limiting.

## Tasks

| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [T1](tasks/T1.md) | Prune the copied base down to the technical spine | — | ready | — | — |
| [T2](tasks/T2.md) | Test infrastructure: Testcontainers and suite layout | T1 | planned | — | — |
| [T3](tasks/T3.md) | Schema baseline: accounts, payments and the ledger | T2 | planned | — | — |
| [T4](tasks/T4.md) | Ledger integrity triggers and the global invariant check | T3 | planned | — | — |
| [T5](tasks/T5.md) | Domain model: Amount, Accounts and the Payment state machine | T1 | planned | — | — |
| [T6](tasks/T6.md) | Settlement: lock, funds check and atomic ledger write | T3, T4, T5 | planned | — | — |
| [T7](tasks/T7.md) | Merchant provisioning script and API key authentication | T1, T3 | planned | — | — |
| [T8](tasks/T8.md) | Accounts API: create Wallet, read Account, read Balance | T6, T7 | planned | — | — |
| [T9](tasks/T9.md) | Create Payment: validation, authorization and idempotency | T6, T7, T8 | planned | — | — |
| [T10](tasks/T10.md) | Concurrency suite | T9 | planned | — | — |
| [T11](tasks/T11.md) | History, Payment list and daily report with keyset pagination | T9 | planned | — | — |
| [T12](tasks/T12.md) | Benchmark dataset and tooling | T4, T11 | planned | — | — |
| [T13](tasks/T13.md) | Experiments: index design and pagination cost | T11, T12 | planned | — | — |
| [T14](tasks/T14.md) | Experiments: concurrency strategy comparison | T10, T12 | planned | — | — |
| [T15](tasks/T15.md) | Project handbook, CI and developer documentation | T9 | planned | — | — |

## Acceptance Criteria Mapping

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| US-1..4 Provisioning, hashed key shown once, clearing Account | T3, T7 | integration, script | planned |
| US-5..8 API key authentication and Merchant scoping | T7, T8, T9 | e2e | planned |
| US-9..15 Wallets, Balance, BRL | T3, T5, T8 | integration, e2e | planned |
| US-16..28 Payment creation, validation, authorization, error model | T5, T9 | unit, e2e | planned |
| US-29..36 Idempotency and crash resume | T3, T9, T10 | integration, e2e, concurrency | planned |
| US-37..46 Settlement, outcomes, lifecycle, one Ledger Transaction per settled Payment | T5, T6, T9 | unit, integration, e2e | planned |
| US-47..52 Concurrency safety | T6, T10 | integration, concurrency | planned |
| US-53..61 Ledger integrity in the database | T3, T4 | integration (SQL) | planned |
| US-62..70 History, Payment list, daily report | T11 | integration, e2e | planned |
| US-71..75 Benchmark dataset and plan capture | T12 | validation scripts | planned |
| US-76..78 Index, pagination and Balance experiments | T13 | experiment, plan regression test | planned |
| US-79 Concurrency strategy comparison | T14 | experiment | planned |
| US-80 Local run and inherited logging | T1, T2, T15 | e2e health, docs check | planned |
| US-81 Migrations build the full schema | T2, T3, T4 | integration | planned |
| US-82 Global invariant check everywhere | T4 (and every DB test) | integration, concurrency | planned |
| US-83 Structured errors and logging inherited | T1, T9 | e2e | planned |
| US-84 CI gate | T2, T15 | CI run | planned |

## Test Strategy

- Unit: pure domain (Amount, Payment state machine and creation rules), cursor helper, key hashing. No database.
- Integration: real PostgreSQL through Testcontainers; repositories, Settlement, schema constraints, and trigger tests by direct SQL (the SQL seam).
- E2E: HTTP API against the Testcontainers database; the main seam.
- Concurrency: separate suite with real parallel connections; assertions on final state and counts only.
- Global invariant check after every database test: total of all Ledger Entries is zero and no Wallet Balance is negative.
- Experiments (T13, T14) are hypothesis-first with recorded plans and timings.
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:concurrency`. Docker is required for database suites.

## Risk Plan

- Data integrity: triggers are hand-written SQL that Prisma does not model; drift is possible if `prisma migrate dev` regenerates. Mitigate by treating migrations as the source of truth and testing triggers from an empty database in every run (T4).
- Concurrency: the lock design is subtle. Mitigate with the dedicated suite and by verifying the weak-lock claim empirically (T10); flaky concurrency tests are treated as defects, not retried.
- Pruning (T1): deleting a large reference base can leave dead references or drop something needed. Mitigate with stepwise removal, typecheck between steps and a repository-wide search at the end; the reference project stays untouched as a guide.
- Performance experiments: numbers depend on hardware. Mitigate by recording machine and PostgreSQL version and comparing only within one environment.
- Money handling: 64-bit integers cross the Prisma `BigInt` boundary. Mitigate with one conversion point in the infra mapper (T5, T6) and tests near limits.
- Public API: idempotency semantics and the not-found rule are contract decisions; they are covered by e2e tests and PRD statements.
- Security: API keys are stored only as hashes and never logged (T7). Hardening beyond that is out of scope until February.
- Operations and CI: Testcontainers needs Docker on developer machines and runners; the concurrency job is separate so it cannot block the fast gate.
- Flaky tests and slow suites: one container per run, serial database suites, bounded randomized rounds.
- Migrations: the reference migrations are discarded; the new baseline starts from an empty history, so no data migration risk exists.

## Execution Order

1. T1 prune the base.
2. T2 test infrastructure.
3. T3 schema baseline, then T4 integrity triggers and invariant helper. T5 (pure domain) can proceed in parallel with T2 to T4.
4. T6 Settlement.
5. T7 provisioning and authentication (can run in parallel with T6 after T3).
6. T8 Accounts API, then T9 Payment creation.
7. T10 concurrency suite, T11 read endpoints and T15 documentation (independent of each other after T9).
8. T12 benchmark dataset, then T13 index and pagination experiments and T14 concurrency experiments.

The project stays working after each step: T1 leaves a bootable app, and every later task adds behavior behind tests.

## Open Questions

No blocking open questions. Resolved during planning: a request that references another Merchant's Account returns the same not-found response as a nonexistent Account (used in T8 and T9). Invalid requests must return 422 even if the inherited validation pipe answers 400 by default (handled in T9).

## Handoff

Ready for `task-runner`. Start with T1.
