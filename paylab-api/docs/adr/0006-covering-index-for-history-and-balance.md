# One covering index on `ledger_entries (account_id, created_at DESC, id DESC) INCLUDE (direction, amount)`

Status: accepted (T13; adopted in migration `20260923160000_read_and_settlement_indexes`)

**Problem.** Ledger Entry history (keyset by `created_at DESC, id DESC`) and the Balance both filter
`ledger_entries` by `account_id`, which had no index. Each read scanned the 183 MB heap for every Wallet, hot
or cold, and the Balance is also computed inside Settlement while the source Wallet lock is held (ADR 0002),
so its latency is the lock hold time and the throughput ceiling of a Wallet.

**Measurement** ([results](../experiments/T13-results.md), sections 1, 2, 5, 6). Baseline 52 to 58 ms for every
history page and Balance. `(account_id)` alone: 6 ms for the cold Wallet but no gain for the hot Wallet (95 k
entries is 5% of the table; bitmap scan plus sort) and a slower hot Balance (104 versus 91 ms in that session).
Composite `(account_id, created_at DESC, id DESC)`: every history page 0.1 to 0.5 ms, flat with depth, no Sort;
Balance unchanged. With `INCLUDE (direction, amount)`: Balance hot 13 ms (95 k entries, Index Only Scan,
`Heap Fetches: 0`), cold 0.25 ms. Settlement with lock and Balance on a skewed mix: 19 tps (only ADR 0005's index), 45 tps
(simple index), 44 tps (composite), 154 tps (covering). Balance grows linearly with the Wallet: 13, 56, 108 ms
at 95 k, 495 k and 995 k entries.

**Alternatives.** Simple `(account_id)`: rejected (no hot-Wallet gain, still sorts). Composite without INCLUDE:
rejected (3.5 times slower Settlement than the covering index for 33 MB less). A partial index: no query has a
minority predicate on this table. Stored or materialized Balance: ADR 0009.

**Choice.** `ledger_entries_account_created_id_idx (account_id, created_at DESC, id DESC) INCLUDE (direction,
amount)`, 140 MB at 1.9 M entries. Column order is equality (`account_id`), then the keyset sort, so rows come out
in order and the row-value cursor condition is an index condition. `direction` and `amount` are payload only.

**Guarantee.** The Balance is still derived from the ledger on every call (CONTEXT.md, Balance); no value is
stored, so nothing can drift. Query text is unchanged ([reads-sql.md](../reads-sql.md)). Plan-regression tests
assert the index is used for history pages with no Sort and for the Balance as an Index Only Scan.

**Cost.** 140 MB and one index insertion per entry (entry insert
about 0.20 to 0.23 ms; throughput within noise of the baseline). Index-only scans need an up-to-date visibility
map: under sustained writes recent pages are read from the heap until autovacuum runs (Balance 7.7 to 8.8 ms
while inserting), which affects speed, never correctness. The INCLUDE columns make the index unusable by
Prisma's model, so it lives only in the hand-written migration.
