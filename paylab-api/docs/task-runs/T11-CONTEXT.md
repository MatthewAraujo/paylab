# T11 Context

## Task

Merchant-scoped, keyset-paginated reads: Ledger Entry history per Wallet, Payment list with filters, daily volume report. Public contract is cursor-only; the exact SQL of each query is documented for T12 to T14 (`docs/tasks/T11.md`). Lane B of the T10 to T15 dispatch; the orchestrator owns `docs/TASKS.md`.

## Related PRD Acceptance Criteria

US-62 to US-70: history newest first with a stable order and an opaque cursor; Payment list with Account, status and period filters and the same cursor style; single Payment read (already done in T9); daily report by status; Merchant isolation everywhere.

## Relevant Prior Summaries

- T8: `ApiKeyGuard` plus `@CurrentMerchant()`, identical 404 for unknown and foreign Accounts, `GetAccountUseCase` ownership rule.
- T9: `ZodValidationPipe` answers 422 with `code: VALIDATION_ERROR`; `test/support/payments.ts` helpers; `fund()` creates a real Payment for the Wallet's Merchant.
- T6: Balance query text (repeated in `docs/reads-sql.md`).

## Files Likely Affected

Application: read-queries repository port, `keyset-page` helper, three use cases. Infra: raw-SQL module and Prisma read adapter, cursor helper and query schemas, controllers (accounts, payments, new reports), presenters, modules. Tests: cursor unit, doc-sync unit, integration on the query builder, three e2e specs, `test/support/reads.ts`. Docs: `docs/reads-sql.md`.

## Test-First Plan

Cursor helper unit tests (round trip, tampered and malformed rejected); e2e for history, Payment list and report (ordering with equal timestamps, no repeat or skip with inserts between pages, last page without cursor, filters alone and combined, Merchant isolation, page size default and maximum, no offset); integration test over all 32 filter combinations of the dynamic Payment list query; a test that `docs/reads-sql.md` contains the exact SQL the app runs.

## Constraints

- Cursor-only keyset, `created_at DESC, id DESC`, row-value comparison; never expose offset.
- Raw SQL for the queries (ADR 0004); no new indexes (T13); days are UTC.
- Path boundary: read code under `src/`, tests, `docs/reads-sql.md`, T11 run files. No changes to PROJECT.md, CI, `test/concurrency/`, `docs/TASKS.md`, ADRs.

## Risks

- Dynamic SQL assembly and positional parameter numbering (mitigated by the 32-combination integration test).
- Cursor tampering: a checksum only detects edits; scope is enforced by the WHERE clause, so a forged position cannot leak other Merchants' rows.
- Seq scans until T13 chooses indexes; expected.

## Definition of Done

Cursor, integration and e2e tests pass; typecheck, lint and all test layers green; `docs/reads-sql.md` holds the exact SQL and is guarded by a test; summary written; one commit.
