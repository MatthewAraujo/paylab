# T3 Summary

## Status

done

## What Changed

- `prisma/schema.prisma`: models `Merchant`, `MerchantApiKey`, `Account`, `Payment`, `LedgerTransaction`, `LedgerEntry`; enums `account_kind`, `payment_status`, `entry_direction`; snake_case tables via `@@map`; UUID ids with database default `gen_random_uuid()` (so raw SQL inserts work); `timestamptz(3)` timestamps; money as `BIGINT` (Prisma `BigInt`); all foreign keys `ON DELETE RESTRICT`.
- Migration `20260923150000_baseline`: Prisma-generated DDL (via `prisma migrate diff --from-empty`) plus hand-written SQL: `accounts_kind_merchant_check`, partial unique index `accounts_one_clearing_per_currency`, `ledger_entries_amount_positive_check`, and the seeded BRL External Clearing Account.
- `test/support/database.ts`: `resetDatabase` now TRUNCATEs all tables except `_prisma_migrations`, `accounts`, `merchants`, then deletes Wallets and Merchants, so the migration-seeded clearing Account survives resets.

## Files Changed

prisma/schema.prisma, prisma/migrations/migration_lock.toml, prisma/migrations/20260923150000_baseline/migration.sql, test/integration/schema.spec.ts, test/support/database.ts.

## Tests Added or Updated

`test/integration/schema.spec.ts` (11 direct-SQL tests: seeded clearing Account, kind/merchant check both ways, one clearing per currency, zero and negative entry amounts, missing Ledger Transaction or Account, duplicate idempotency key per Merchant, same key for different Merchants, one Payment per Ledger Transaction, restrictive FK, clearing Account survives reset). Written first and observed red (11 failing) before the schema existed.

## Commands Run

`pnpm test:integration` (16 passed), `pnpm test:e2e`, `pnpm test:concurrency`, `pnpm typecheck`, `pnpm lint`.

## Validation Result

All green locally.

## Decisions Made

- BigInt boundary: Prisma `BigInt` values are converted to/from the domain Amount only in the infra mapper (T5/T6); nothing else touches `bigint`. Documented as a comment in the schema.
- Prisma raw-query errors show SQLSTATE and key columns for unique violations (not the index name); tests assert on `23505` plus key columns. Check and FK violations do include the constraint name.
- Currency is `text`; the BRL-only rule lives in the domain, not a database check.
- Foreign keys keep Prisma's default `ON UPDATE CASCADE`; only deletes are restricted.
- No indexes beyond constraints; history indexes are benchmark subjects.

## Follow-up Needed

`prisma migrate dev` may report drift for the hand-written constraints/index (not verified); treat migrations as the source of truth (noted in the schema header).

## Context for Next Task

T4 adds ledger triggers in a new hand-written migration. The seeded clearing Account has no ledger entries, so invariants stay clean on a fresh database.
