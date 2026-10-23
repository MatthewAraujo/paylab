# Tasks — FakeBank October MVP

## Source Context

- [PRD](PRD.md) (AC-1 to AC-34), [ADR 0001](adr/0001-fakebank-as-an-independent-http-service.md), glossary and decisions in [CONTEXT.md](../CONTEXT.md).
- Workspace `PROJECT.md`, `compose.yaml`, and the workspace `CONTEXT.md` note on Nest watch mode needing `procps`.
- Prior art in `paylab-api` (copied and trimmed, never imported): Vitest layer configs, `test/support` (Testcontainers global setup, `buildTestApp`), `test/concurrency/idempotency.spec.ts`, `test/e2e/benchmarks-production.e2e-spec.ts`, environment validation, HTTP error translation, `Dockerfile`, `docker-compose.yml`, the `PaymentSubmitter` idempotency pattern.

## Implementation Goal

Build FakeBank as a standalone NestJS HTTP service with its own PostgreSQL: authenticated, idempotent creation and lookup of Provider Transactions, a pure `PROCESSING → SUCCEEDED | FAILED` state machine with immutable events, and a flag-guarded lab surface whose Simulation Scenarios reproduce business failures, deferred decisions, rate limiting, failures before and after persistence, and post-persistence delays. It runs alone with Docker Compose and inside the workspace development stack.

## Non-Goals

PayLab consuming FakeBank or any change to PayLab services; webhooks; reconciliation files; a real rate limiter; `/__test/reset`; `/ready`; Client storage in a database; scenarios on reads; automatic completion of deferred transactions; refunds; non-BRL currencies; AWS deployment; a FakeBank UI; CI workflows.

## Tasks

| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [T1](tasks/T1.md) | Service skeleton | — | done | [context](task-runs/T1-CONTEXT.md) | [summary](task-runs/T1-summary.md) |
| [T2](tasks/T2.md) | Provider Transaction state machine | — | done | [context](task-runs/T2-CONTEXT.md) | [summary](task-runs/T2-summary.md) |
| [T3](tasks/T3.md) | Create and read a Provider Transaction (immediate success) | T1, T2 | done | [context](task-runs/T3-CONTEXT.md) | [summary](task-runs/T3-summary.md) |
| [T4](tasks/T4.md) | Idempotency | T3 | done | [context](task-runs/T4-CONTEXT.md) | [summary](task-runs/T4-summary.md) |
| [T5](tasks/T5.md) | Lookup by External Reference | T3 | done | [context](task-runs/T5-CONTEXT.md) | [summary](task-runs/T5-summary.md) |
| [T6](tasks/T6.md) | Lab surface and business Outcomes | T3 | done | [context](task-runs/T6-CONTEXT.md) | [summary](task-runs/T6-summary.md) |
| [T7](tasks/T7.md) | Advance a deferred Provider Transaction | T6 | done | [context](task-runs/T7-CONTEXT.md) | [summary](task-runs/T7-summary.md) |
| [T8](tasks/T8.md) | Transport Outcomes and delay | T4, T6 | done | [context](task-runs/T8-CONTEXT.md) | [summary](task-runs/T8-summary.md) |
| [T9](tasks/T9.md) | Docker Compose (standalone and workspace) and documentation | T3 | done | [context](task-runs/T9-CONTEXT.md) | [summary](task-runs/T9-summary.md) |

## Acceptance Criteria Mapping

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| AC-1 | T3 | e2e | done |
| AC-2 | T4 | e2e | done |
| AC-3 | T3 | e2e | done |
| AC-4 | T4, T7 | e2e | done |
| AC-5 | T4 | e2e | done |
| AC-6 | T4 | e2e | done |
| AC-7 | T3 | e2e | done |
| AC-8 | T5 | e2e | done |
| AC-9 | T3, T5 | e2e | done |
| AC-10 | T1 (and every task's error codes) | e2e | done |
| AC-11 | T1 | e2e | done |
| AC-12 | T1, T3, T4, T5, T6, T7, T8 | e2e | done |
| AC-13 | T6 | e2e | done |
| AC-14 | T6 | e2e | done |
| AC-15 | T6 | e2e | done |
| AC-16 | T8 | e2e | done |
| AC-17 | T8 | e2e | done |
| AC-18 | T8 | e2e | done |
| AC-19 | T8 | e2e | done |
| AC-20 | T6, T8 | e2e | done |
| AC-21 | T8 | e2e | done |
| AC-22 | T8 | concurrency | done |
| AC-23 | T6 | e2e | done |
| AC-24 | T7 | e2e | done |
| AC-25 | T7 | e2e | done |
| AC-26 | T2 | unit | done |
| AC-27 | T2, T3, T6, T7 | unit, e2e | done |
| AC-28 | T3 | integration | done |
| AC-29 | T6, T7 | e2e | done |
| AC-30 | T6 | unit (env schema), manual | done |
| AC-31 | T4 | concurrency | done |
| AC-32 | T9 | manual (documented commands) | done |
| AC-33 | T9 | manual (documented commands) | done |
| AC-34 | T3, T9 | unit, e2e, manual | done |

## Test Strategy

- **E2E (main seam):** the real application module against a Testcontainers PostgreSQL, driven by Supertest; event assertions read the database directly. `pnpm test:e2e`.
- **Concurrency:** parallel HTTP requests for idempotency and scenario consumption, run separately. `pnpm test:concurrency`.
- **Unit:** the pure state machine and environment parsing. `pnpm test`.
- **Integration:** database triggers through direct SQL. `pnpm test:integration`.
- **Manual:** both Compose stacks with the commands in T9; results recorded in the task run summary.
- **Regression:** each task keeps every earlier test green; T9 checks the PayLab services are unchanged.
- **Gate per task:** `pnpm lint && pnpm typecheck && pnpm test` plus the layers the task touches.

## Risk Plan

- **Security — lab exposure:** lab routes absent unless the flag is on; boot refuses the flag in production (T6). Recorded in `CONTEXT.md` for November.
- **Security — keys:** only SHA-256 hashes in configuration, constant-time comparison, keys never logged (T3); the development key is confined to development Compose files (T9).
- **Concurrency:** duplicate creation guarded only by the unique constraint (T4); scenario attempts consumed by one conditional decrement (T6, proven in T8); advance guarded by a status-conditioned update (T7).
- **Long transactions:** delays always after commit, never inside an open transaction (T8).
- **Flaky timing tests:** delays in tests kept short with clear margins between client timeout and `delayMs`; parallel tests assert counts, not ordering.
- **Migrations:** hand-written SQL including triggers; a broken migration fails the Testcontainers setup immediately.
- **Workspace stack regression:** T9 must not change PayLab services; port 4000 must be free.
- **Install scripts:** read `package.json` scripts (postinstall `prisma generate`) before installing (T1).

## Execution Order

1. T1 and T2 (independent; can run in parallel).
2. T3.
3. T4, T5, T6 and T9 (independent of each other after T3).
4. T7 (after T6).
5. T8 (after T4 and T6), last because it crosses idempotency, scenarios and timing.

## Open Questions

No blocking open questions.

## Handoff

Ready for `task-runner`. Start with T1 (T2 may run in parallel).
