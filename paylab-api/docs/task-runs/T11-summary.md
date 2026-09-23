# T11 Summary

## Status

done

## What Changed

- `GET /v1/accounts/:id/entries`: a Wallet's Ledger Entry history, newest first. Items `{ id, ledgerTransactionId, direction, amount, createdAt }`. An unknown, foreign or clearing Account is the same 404 as elsewhere.
- `GET /v1/payments`: the caller's Payments, same item shape as `GET /v1/payments/:id`. Filters `accountId` (source or destination), `status`, `from` (inclusive) and `to` (exclusive); `from`/`to` accept an ISO 8601 timestamp with a zone or a `YYYY-MM-DD` day (00:00 UTC). A foreign `accountId` just narrows the caller's own Payments (no existence check, nothing leaks).
- `GET /v1/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`: `{ from, to, items: [{ date, status, count, volume }] }`, UTC days, both ends inclusive, at most 366 days, ordered by day then status (enum order), empty range gives `items: []`.
- Pagination is cursor-only: `?limit=` (default 20, max 100; out of range is 422, not clamped) and `?cursor=`; responses are `{ items, nextCursor }` with `nextCursor: null` on the last page. Unknown query parameters (`offset`, `page`) are rejected with 422, so offset is not exposed.
- Cursor: base64url of `<iso time>|<id>|<checksum>` (`src/infra/http/pagination/cursor.ts`). The checksum catches edits and corruption; it is not a security control, since a forged position can only move inside the caller's own scope (every query filters by Merchant or Account first). Bad cursors are 422 `VALIDATION_ERROR`.
- Application layer: `ReadQueriesRepository` port, `keyset-page` helper (fetch page size + 1, drop the extra row, build the next position), `ListAccountEntriesUseCase`, `ListPaymentsUseCase`, `GetDailyReportUseCase`.
- SQL: `src/infra/database/read-queries-sql.ts` is the single source of the query text; `docs/reads-sql.md` mirrors it and a unit test fails if they drift. The Payment list is one skeleton with optional predicate lines built by `buildPaymentListQuery`; history has separate first-page and next-page texts.

## Files Changed

`src/domain/paylab/application/{repositories/read-queries-repository.ts, services/keyset-page.ts, use-cases/{list-account-entries,list-payments,get-daily-report}.ts}`, `src/infra/database/{read-queries-sql.ts, ledger.module.ts, repositories/prisma-read-queries-repository.ts}`, `src/infra/http/{pagination/{cursor,query-schemas}.ts, controllers/{accounts,payments,reports}.controller.ts, presenters/{keyset-page,account,payment}-presenter.ts, accounts.module.ts, payments.module.ts, reports.module.ts}`, `src/infra/app.module.ts`, `docs/reads-sql.md`, tests below, `docs/task-runs/T11-*.md`. No schema, migration or index change.

## Tests Added or Updated

- Unit: `test/infra/http/pagination/cursor.spec.ts` (10: round trip, opaque, malformed, tampered, non-canonical), `test/infra/database/read-queries-doc.spec.ts` (5: doc contains the exact SQL).
- Integration: `test/integration/read-queries.spec.ts` (4): all 32 combinations of Payment list filters plus cursor against the plain-code meaning, 30 history entries sharing one timestamp paged exhaustively, large integer amounts, report grouping with 10 billion centavos volume.
- E2E: `test/e2e/history.e2e-spec.ts` (11), `test/e2e/payments-list.e2e-spec.ts` (13), `test/e2e/reports.e2e-spec.ts` (7): order with equal timestamps, no repeat or skip with rows inserted between pages, last page without cursor, filters alone and combined, Merchant isolation, page size limits, tampered cursor, no offset, UTC day boundaries, invalid ranges, 401.
- Test-first honesty: the cursor spec was seen red before the helper existed. The e2e, integration and doc specs were written before the endpoints and queries but not run red (the modules or files they import did not exist, so they could only fail to load); they were green on the first full run after typecheck, apart from three defects in the tests themselves (a helper that sent a cursor twice, and a wrong assumption that the Merchant has one Payment after `fund`), fixed in the tests.

## Commands Run

`pnpm typecheck`, `pnpm lint` (after `biome check --write src test` for formatting only), `pnpm test` (99), `pnpm test:integration` (61), `pnpm test:e2e` (71), `pnpm test:concurrency` (1). `pnpm install --frozen-lockfile --offline` was needed once in the fresh worktree.

## Validation Result

All layers green; the global invariant check ran after every database test and was clean.

## Decisions Made

- Page size out of range is a 422, not a silent clamp; the client learns its request was wrong.
- History and list queries fetch page size + 1 and never count rows, so deep pages cost the same as the first (US-64).
- The Payment list scopes by `merchant_id` only; Account filter is an extra predicate, no ownership lookup.
- The funding Payment made by `fund()` (clearing to Wallet) is a normal Payment of the Wallet's Merchant and appears in the list.
- Report `volume` is the sum of requested amounts per status (all statuses, including `FAILED`), in integer centavos.

## Follow-up Needed

- T13 chooses the indexes; today history filters `ledger_entries` by `account_id` and the list/report filter `payments` by `merchant_id` with no supporting index (sequential scans on the benchmark dataset are the expected baseline).
- The orchestrator may want a short `CONTEXT.md` note on the decisions above (cursor checksum is not a security control; UTC days; 422 on out-of-range page size). I did not edit it, per the lane boundary.

## Context for Next Task

T12 and later reuse `docs/reads-sql.md` and can import `HISTORY_FIRST_PAGE_SQL`, `HISTORY_NEXT_PAGE_SQL`, `DAILY_REPORT_SQL` and `buildPaymentListQuery` from `src/infra/database/read-queries-sql.ts`. Test helpers `insertCreditAt`, `insertPaymentAt`, `get`, `collectPages` are in `test/support/reads.ts`. The Balance query text is repeated in `docs/reads-sql.md` for completeness.
