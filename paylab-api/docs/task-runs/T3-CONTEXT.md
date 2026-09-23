# T3 Context

## Task

Schema baseline through Prisma plus one migration: merchants, API keys (hash only), accounts, payments, ledger transactions, ledger entries, with non-trigger constraints and the BRL External Clearing Account. Spec: `docs/tasks/T3.md`.

## Related PRD Acceptance Criteria

US-1..4, US-9..15, US-29..34 (idempotency uniqueness), US-45, US-53..59 (structural part).

## Relevant Prior Summaries

`T2-summary.md`: Testcontainers layers, `resetDatabase`, `migrationsApplied`, `prisma migrate deploy` in global setup.

## Files Likely Affected

`prisma/schema.prisma`, `prisma/migrations/*`, `test/integration/schema.spec.ts`, `test/support/database.ts` (reset must keep the seeded clearing Account).

## Test-First Plan

Direct-SQL integration specs for every constraint listed in the task (kind/merchant check, one clearing per currency, positive amounts, FK rejection, idempotency uniqueness per Merchant, one Payment per Ledger Transaction, seeded clearing Account).

## Constraints

No triggers (T4), no history indexes (benchmark subjects), restrictive foreign keys, money as 64-bit integer.

## Risks

Hand-written SQL in the migration is not modelled by Prisma; regenerating the baseline would drop it.

## Definition of Done

`prisma migrate deploy` builds the schema from empty and all schema integration tests pass.
