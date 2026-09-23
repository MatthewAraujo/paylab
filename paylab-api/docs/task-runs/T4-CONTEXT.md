# T4 Context

## Task

Enforce ledger invariants in PostgreSQL (ADR 0003) with a hand-written SQL migration, and provide the reusable global-invariant helper hooked into the integration and concurrency setup. Spec: `docs/tasks/T4.md`.

## Related PRD Acceptance Criteria

US-53..61 (ledger integrity in the database), US-82 (global invariant check).

## Relevant Prior Summaries

`T2-summary.md` (setup hooks, `resetDatabase`), `T3-summary.md` (schema, seeded clearing Account, reset keeps it).

## Files Likely Affected

`prisma/migrations/20260923151000_ledger_integrity_triggers/migration.sql`, `test/integration/ledger-integrity.spec.ts`, `test/integration/invariants.spec.ts`, `test/support/invariants.ts`, `test/support/fixtures.ts`, `test/integration/schema.spec.ts`.

## Test-First Plan

Direct-SQL specs inside explicit transactions (constraint triggers fire at commit): unbalanced, empty, single-entry, balanced, one statement vs several, immutability of entries and transactions, TRUNCATE still allowed; helper: clean on empty and after valid movements, violation on non-zero total and on negative Wallet Balance.

## Constraints

Deferrable initially deferred constraint triggers; immutability by row-level before-update-or-delete triggers; TRUNCATE intentionally uncovered and noted in the migration; readable, commented SQL.

## Risks

T3's schema specs created lone Ledger Transactions and entries that the new triggers reject; they were adapted to commit valid transactions.

## Definition of Done

All trigger tests pass; invariant helper available to all layers and invoked automatically after integration and concurrency tests.
