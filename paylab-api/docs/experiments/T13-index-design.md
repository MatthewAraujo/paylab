# T13 — Index design and pagination cost: hypotheses and method

Written **before any measurement** (see the integrity note in
[T13-results.md](T13-results.md)). Nothing below has been observed on the benchmark database yet;
the only inputs are the schema, the query text in [reads-sql.md](../reads-sql.md), and the
dataset shape documented in [benchmark.md](../benchmark.md) (1.9 M entries, 1.0 M Payments,
1,000 Wallets, 50 Merchants, top 1% of Wallets hold half of the entries).

## Environment and method

- Benchmark database only (`BENCH_DATABASE_URL`, PostgreSQL 16 in Docker, port 5433). Machine,
  CPU count, RAM and PostgreSQL version are recorded in the results document.
- The machine is otherwise idle during every timing run: no test suite, build or other container
  workload runs at the same time. Runs are sequential.
- Every timing is `EXPLAIN (ANALYZE, BUFFERS)` of the exact SQL of `reads-sql.md`, with literal
  values. Each query runs once to warm the cache (discarded), then 7 times; the median
  `Execution Time` is reported, with the cache state (warm: table and index fully in
  `shared_buffers`, 1 GB). `VACUUM (ANALYZE)` is run after every index change.
- Targets come from `pnpm bench:targets`: a **hot** Wallet (about 95 k entries, about 5% of the
  table), a **cold** Wallet (about 870 entries, 0.05%), a **hot** Merchant (about 60 k Payments,
  6%) and a **cold** Merchant (about 10 k Payments, 1%).
- Index variants are applied one at a time, plans and timings captured, then dropped before the
  next. Write cost is measured on a scratch clone of the database with a Settlement-shaped
  workload (one Payment, one Ledger Transaction, two entries per database transaction, so the
  deferred triggers run at commit), the same count of transactions for each variant.
- Adoption rule: a clear measured win on a documented query, and a write cost that is small
  next to what the write path already pays.

## Load shapes

| Shape | Target | Why |
| --- | --- | --- |
| Hot Wallet | about 95 k entries | history, Balance and offset depth all stress the biggest account |
| Cold Wallet | about 870 entries | the typical Merchant Wallet |
| Hot Merchant | about 60 k Payments | Payment list and report on the biggest tenant |
| Cold Merchant | about 10 k Payments | typical tenant |
| Depth | offsets 0, 1 k, 10 k, 50 k, 90 k on the hot Wallet | shows how pagination cost grows |
| Ledger growth | the entries table at 10%, 25%, 50%, 100% of the dataset | shows how the commit-time trigger cost grows |

## Hypotheses

Column names: `ledger_entries (id, ledger_transaction_id, account_id, direction, amount, created_at)`,
`payments (id, merchant_id, source_account_id, destination_account_id, amount, status, created_at, ...)`.

**H0 — Baseline, no supporting index (history, Balance).**
Both queries filter `ledger_entries` by `account_id`, which has no index (foreign keys carry
none in PostgreSQL). Expect a (parallel) sequential scan of the whole 258 MB table for hot and
cold Wallet alike: about 100 ms, independent of the Wallet, a top-N sort for history and an
aggregate for Balance. The cost per query is proportional to table size, not to the Wallet.

**H1 — Simple index on `(account_id)`.**
Cold Wallet: index or bitmap scan of about 870 rows, then sort or aggregate, 1 to 3 ms (large
win). Hot Wallet: 95 k rows is about 5% of the table, at or beyond the planner's break-even;
expect a bitmap heap scan followed by a top-N sort of 95 k rows for history, about 40 to 100 ms,
so **little or no win over the sequential scan for history on the hot Wallet**. Balance on the hot
Wallet: bitmap heap scan and aggregate, faster than baseline but still tens of ms.

**H2 — Composite `(account_id, created_at DESC, id DESC)` (equality, then sort).**
History first page and next page become an index scan that stops after `LIMIT` rows and needs no
sort: under 1 ms for hot and cold Wallets alike, and constant with pagination depth. Balance
does not benefit from the ordering, so it stays H1-like (heap fetches for `direction`, `amount`).
**H2b — same key plus `INCLUDE (direction, amount)`**: Balance becomes an index-only scan on a
freshly vacuumed table, hot about 20 to 35 ms (95 k index entries, no heap), cold under 1 ms; the
index is about 1.4 times larger than H2.

**H3 — Partial indexes.**
Entries have no minority predicate that a query uses, so no partial index on `ledger_entries` is
expected to help. For Payments, `status` values are 95% SUCCEEDED, so a partial index on the
majority value fails the selectivity gate; a partial index on the minority statuses
(`status <> 'SUCCEEDED'`, about 5%) can only help a status-filtered list for those values.
Expected verdict: **rejected**, because the composite index of H5 already serves those lists with
a residual filter fast enough and the partial index adds write and maintenance cost for a
narrow case.

**H4 — Keyset versus offset (hot Wallet history).**
With H2 in place: keyset cost is flat (under 1 ms) at every depth; offset cost grows about
linearly with depth (offset 90 k reads and discards 90 k index entries plus heap-visibility
work, tens of ms). Without any index both are sequential scans with a top-N sort of a growing
`LIMIT + OFFSET` heap, so both are about 100 ms and the difference is hidden until the index
exists. The plan difference to show: `Index Scan` with `Index Cond: (account_id, (created_at,id))`
and no `Sort`, versus an `Index Scan` whose `Limit` node discards `OFFSET` rows.

**H5 — Payment list (`merchant_id`, optional filters) and report.**
Baseline: sequential scan of `payments` (379 MB with indexes, heap about 250 MB), about 150 to
250 ms for every Merchant, with top-N sort. The existing unique index `(merchant_id,
idempotency_key)` can serve `merchant_id = ?` but delivers rows in key order, so it needs a sort
of 10 to 60 k rows: expected faster than a sequential scan for the cold Merchant, comparable for
the hot one. A composite `(merchant_id, created_at DESC, id DESC)` gives the list first page and
next pages in under 1 ms and serves the `created_at` range of the report. Filters by `status` or
account run as residual filters on that index: for a rare status (CREATED 0.5%) the scan may read
a few thousand index entries before finding 21 rows, expected a few ms. Report: the aggregate
reads every Payment of the Merchant in the range regardless of index. Expect the composite index
to reduce a hot-Merchant 30-day report from a sequential-scan level (about 200 ms) to about 20 to
50 ms (about 20 k heap rows), and `INCLUDE (status, amount)` to make it index-only and roughly
halve that. The account-filter `OR (source OR destination)` is not index-supportable by the
composite; it is expected to stay a residual filter and to be acceptable.

**H6 — Commit-time trigger cost (`ledger_transaction_id`), the finding inherited from T12.**
`ledger_assert_transaction_balanced` runs three times per Settlement commit (once for the
Ledger Transaction row, once for each of its two entries) and each run does
`SELECT ... FROM ledger_entries WHERE ledger_transaction_id = $id`. With no index that is a scan
of the whole table per call: expected tens of ms per call at 1.9 M entries, so a commit costs
roughly 3 times the sequential scan (100 to 300 ms), **growing linearly with the ledger**, and it
happens inside the Settlement transaction that holds the source Wallet lock (ADR 0002), so it
directly caps per-Wallet throughput. With a plain index on `ledger_transaction_id` each call is an
index lookup of two rows, under 0.1 ms, flat as the ledger grows. Expected verdict: **adopt**;
write cost of one extra index entry per inserted entry is small next to the saving.

**H7 — Balance under lock contention and materialization.**
`Balance` is an MVCC read; a concurrent debit holding `FOR NO KEY UPDATE` on the Wallet row does
not block it, so Balance latency under contention should equal Balance latency alone (within
noise). The lock matters for Settlement, whose lock-hold time is the Balance computation plus the
inserts plus the commit-time triggers. Hypothesis: with H2b and H6 in place, lock-hold time on the
hot Wallet is a few tens of ms and grows linearly with the Wallet's entry count; at this
dataset's scale (95 k entries for the hottest Wallet) a materialized Balance is **not justified**
by evidence, and is recorded as a proposal only, with the point at which it would become
justified.

**H8 — Write cost.**
Each additional B-tree index adds one index insertion per inserted row. Expect an insert-workload
slowdown of a few percent per index on the entries table (two entries per Settlement), dominated
by the fixed transaction and trigger overhead, and much lower than the read savings. H6 is the
exception that goes the other way: the index on `ledger_transaction_id` should make the
Settlement workload **faster**, not slower, because it removes the trigger scans.

## Decision procedure

For each candidate: measured read plan and timing on the documented queries, measured write
impact, size of the index, then adopt, adopt with changes, or reject; every major decision
becomes an ADR (problem, measurement, alternatives, choice, guarantee, cost).
