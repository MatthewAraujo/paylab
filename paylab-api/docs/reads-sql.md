# Read queries: exact SQL

The Merchant-facing read queries of T11, as PostgreSQL runs them. The text below is
mirrored from `src/infra/database/read-queries-sql.ts`, which is what the application
executes; `test/infra/database/read-queries-doc.spec.ts` fails if the two drift apart.
T12 to T14 reuse this text unchanged (benchmark datasets, `EXPLAIN (ANALYZE, BUFFERS)`,
index and pagination experiments), so any change to a query is made in that file and
copied here.

## Conventions

- **Keyset order**: `created_at DESC, id DESC`. The position of the last row of a page is
  compared as a row value, `(created_at, id) < ($ts, $id)`. `created_at` is
  `timestamptz(3)`, so a position survives a round trip through JavaScript `Date` exactly.
- **Fetch size**: every query is called with page size + 1. The extra row only signals that
  another page exists and is dropped; the cursor is built from the last kept row. The
  default page size is 20 and the maximum is 100, so `$fetch` is between 2 and 101.
- **First page versus next page**: two separate texts, not one text with
  `$n IS NULL OR ...`, so each has its own clean plan.
- **Scope**: every query is filtered by Merchant, directly (`merchant_id`) or through the
  Account, which the use case has already proven belongs to the caller.
- **Days** in the report are UTC. The use case turns the inclusive `from` and `to` days into
  the half-open instant range `[from 00:00Z, to+1 day 00:00Z)`.
- **Indexes**: only what the constraints already give exist (primary keys, the unique
  `(merchant_id, idempotency_key)` on `payments`, foreign keys carry no index in
  PostgreSQL). There is no index on `ledger_entries.account_id` or on
  `payments (merchant_id, created_at, id)` yet; choosing them is T13.

## Ledger Entry history

`GET /v1/accounts/:id/entries`. `$1` is the Wallet id.

First page (`$2` = fetch size):

```sql
SELECT id, ledger_transaction_id, direction, amount, created_at
FROM ledger_entries
WHERE account_id = $1::uuid
ORDER BY created_at DESC, id DESC
LIMIT $2
```

Next page (`$2`, `$3` = `created_at` and `id` of the last row of the previous page, `$4` = fetch size):

```sql
SELECT id, ledger_transaction_id, direction, amount, created_at
FROM ledger_entries
WHERE account_id = $1::uuid
  AND (created_at, id) < ($2::timestamptz, $3::uuid)
ORDER BY created_at DESC, id DESC
LIMIT $4
```

## Payment list

`GET /v1/payments`. One skeleton; each optional line is present only when its filter is
given, and parameters are numbered in the order the lines appear. `$1` is the Merchant id.

Lines, in order:

| Line | Filter |
| --- | --- |
| `AND (source_account_id = $n::uuid OR destination_account_id = $n::uuid)` | `accountId`: source or destination |
| `AND status = $n::payment_status` | `status` |
| `AND created_at >= $n::timestamptz` | `from`, inclusive |
| `AND created_at < $n::timestamptz` | `to`, exclusive |
| `AND (created_at, id) < ($n::timestamptz, $m::uuid)` | `cursor`, `m = n + 1` |

No filters, first page (`$2` = fetch size):

```sql
SELECT id, source_account_id, destination_account_id, amount, currency, status,
       failure_reason, ledger_transaction_id, created_at, updated_at
FROM payments
WHERE merchant_id = $1::uuid
ORDER BY created_at DESC, id DESC
LIMIT $2
```

Every filter and a cursor at once (`$2` account, `$3` status, `$4` from, `$5` to,
`$6`/`$7` cursor position, `$8` fetch size):

```sql
SELECT id, source_account_id, destination_account_id, amount, currency, status,
       failure_reason, ledger_transaction_id, created_at, updated_at
FROM payments
WHERE merchant_id = $1::uuid
  AND (source_account_id = $2::uuid OR destination_account_id = $2::uuid)
  AND status = $3::payment_status
  AND created_at >= $4::timestamptz
  AND created_at < $5::timestamptz
  AND (created_at, id) < ($6::timestamptz, $7::uuid)
ORDER BY created_at DESC, id DESC
LIMIT $8
```

Any other combination is these two with the missing lines removed and the parameters
renumbered; `buildPaymentListQuery` in `read-queries-sql.ts` produces all 32 and an
integration test checks each against the plain-code meaning of its filters.

## Daily report

`GET /v1/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`. `$1` is the Merchant id, `$2` the
inclusive start instant, `$3` the exclusive end instant:

```sql
SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
       status,
       count(*)::bigint AS count,
       sum(amount)::bigint AS volume
FROM payments
WHERE merchant_id = $1::uuid
  AND created_at >= $2::timestamptz
  AND created_at < $3::timestamptz
GROUP BY 1, 2
ORDER BY 1 ASC, 2 ASC
```

`status` sorts in enum declaration order (`CREATED`, `PROCESSING`, `SUCCEEDED`, `FAILED`).

## Balance (from T6, for completeness)

`GET /v1/accounts/:id/balance`, in `prisma-accounts-repository.ts`. `$1` is the Account id:

```sql
SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
FROM ledger_entries
WHERE account_id = $1::uuid
```
