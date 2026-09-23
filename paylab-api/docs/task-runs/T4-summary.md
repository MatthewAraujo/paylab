# T4 Summary

## Status

done

## What Changed

- Migration `20260923151000_ledger_integrity_triggers` (hand-written SQL):
  - `ledger_assert_transaction_balanced()` plus deferred constraint triggers `ledger_transactions_balanced` and `ledger_entries_balanced` (AFTER INSERT, DEFERRABLE INITIALLY DEFERRED). At commit each Ledger Transaction must have at least two entries and debits minus credits must be zero (summed as numeric, no overflow). Errors use SQLSTATE `check_violation`.
  - `ledger_reject_mutation()` plus row-level BEFORE UPDATE OR DELETE triggers `ledger_entries_immutable` and `ledger_transactions_immutable` (SQLSTATE `restrict_violation`).
  - TRUNCATE intentionally uncovered, documented in the migration header.
- `test/support/invariants.ts`: `getInvariantViolations()` (sum of all entries is zero, debits positive; no Wallet with negative Balance) and `assertGlobalInvariants()`; already invoked afterEach by `test/support/setup-database.ts` for integration and concurrency.
- `test/support/fixtures.ts`: shared SQL fixtures (`one`, `createMerchant`, `createWallet`, `clearingAccountId`, `createFundingLedgerTransaction`).
- `test/integration/schema.spec.ts` adapted (see Decisions).

## Files Changed

prisma/migrations/20260923151000_ledger_integrity_triggers/migration.sql, test/integration/ledger-integrity.spec.ts, test/integration/invariants.spec.ts, test/integration/schema.spec.ts, test/support/invariants.ts, test/support/fixtures.ts.

## Tests Added or Updated

- `ledger-integrity.spec.ts` (13): unbalanced 80/70, empty, single entry, balanced two and three entries, multi-row single statement, several statements in one transaction, late entry to a committed transaction (rejected unless compensating), UPDATE/DELETE on entries and transactions rejected, rejected mutation leaves data intact, TRUNCATE allowed. Observed red (11 failing) before the migration.
- `invariants.spec.ts` (5): clean on empty and after valid movements, violation on non-zero total (triggers disabled only inside that test, always re-enabled and data reset), violation on negative Wallet Balance, clearing Account's negative Balance not flagged.
- `schema.spec.ts`: ledger rows now created in one database transaction or via a valid funding transaction.

## Commands Run

`pnpm test` (33), `pnpm test:integration` (35), `pnpm test:concurrency` (1), `pnpm test:e2e` (1), `pnpm typecheck`, `pnpm lint`.

## Validation Result

All green locally.

## Decisions Made

- One shared trigger function on both ledger tables (transaction row or entry inserted first, either order works).
- Adding entries to an already committed transaction is allowed only if the transaction stays balanced.
- Negative Wallet Balance is NOT a database rule (overdraft prevention is Settlement's job, T6); the invariant helper is its safety net.
- Prisma raw-query errors carry the trigger's message text, so specs assert on it.

## Follow-up Needed

Triggers exist only through migrations (Prisma does not model them), so any future migration touching the ledger tables must keep them; the test suite catches a loss because it builds the database from migrations every run.

## Context for Next Task

T6 must insert a Ledger Transaction and all its entries in one database transaction. `assertGlobalInvariants` runs automatically after each integration and concurrency test; use `createFundingLedgerTransaction` from `test/support/fixtures.ts` to fund Wallets in specs.
