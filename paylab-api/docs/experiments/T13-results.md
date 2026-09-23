# T13 — Index design and pagination cost: results

Decisions: [ADR 0005](../adr/0005-index-ledger-entries-by-transaction-for-the-commit-trigger.md),
[0006](../adr/0006-covering-index-for-history-and-balance.md),
[0007](../adr/0007-merchant-time-index-for-payment-list-and-report.md),
[0008](../adr/0008-cursor-keyset-only-offset-rejected.md),
[0009](../adr/0009-no-materialized-balance-for-september.md). Hypotheses and method:
[T13-index-design.md](T13-index-design.md). Raw output of every run: [raw/](raw/); plans:
[plans/](plans/). The shipped result is migration
`prisma/migrations/20260923160000_read_and_settlement_indexes`.

## Integrity of the experiment

- The hypothesis document was written and hashed **before the first measurement**:
  `sha256 1d8f102ff688967368f2aa02dab6d2c0d27c263ea403a75b5515a3e8afb0351c`, 2026-09-23T19:21Z
  (the file has not been edited since; the hypotheses below are quoted from it, not revised).
  The scorecard at the end says which held and which did not.
- Machine: AMD Ryzen 7 5825U (8 cores, 16 logical CPUs), 15 GiB RAM, Linux 7.0.0-31. PostgreSQL 16.15
  (postgres:16-alpine, Docker), `shared_buffers=1GB`, `work_mem=32MB`, `effective_cache_size=3GB`,
  `random_page_cost=4`, `synchronous_commit=on` (set to `off` only where stated). Dataset: T12 full run,
  seed `paylab-benchmark-v1`: 1.90 M entries, 1.00 M Payments, 1,000 Wallets, 50 Merchants.
- Nothing else heavy ran during measurement: no test suite, build or other lane (an unrelated idle
  PostgreSQL container was up). Tests and the migration were run only after all measurements.
- Cache state: every timing is warm (table and index fully in `shared_buffers`; one discarded warm-up
  run, then the median of 7). Timings **drift between sessions** on this laptop (the same baseline
  history query measured 96 ms in the first session and 52–58 ms later, the hot Balance on the
  same index 28 ms and 13 ms). The reason was not investigated. Every comparison below is therefore
  made inside one session, and the headline table restates the baseline in the same session as the
  adopted schema. Ratios are trustworthy, absolute milliseconds are this machine, this day.
- Targets: hot Wallet 95,496 entries; cold Wallet 873 entries; hot Merchant 60,209 Payments; cold
  Merchant 9,884 Payments. The account filter of the Payment list uses each Merchant's own most
  active Wallet (1191324a… for the hot Merchant with 50,538 source Payments, 3fca1261… for the cold
  one with 537 matching Payments), plus a "rare match" case (a Wallet that matches 4 of the cold
  Merchant's 9,884 Payments). A first version of the suite paired Wallets with the wrong Merchants;
  it was found while reading a plan and rerun, and those numbers are not used.
- Experiment code: `bench/exp/` (Python and shell helpers over `docker exec psql`, pgbench scripts).
  It is not imported by `src/`, not part of `nest build` (`dist/` has no `bench`), and does not ship.

## 1. Headline: baseline versus the adopted schema (one session, warm)

Baseline is the constraint-provided indexes only. Adopted is the three indexes of the migration.

| Query (SQL of [reads-sql.md](../reads-sql.md)) | Baseline ms | Adopted ms | Plan after |
| --- | ---: | ---: | --- |
| History, first page, hot Wallet | 57.7 | **0.11** | Index Scan, no Sort |
| History, next page (offset ~50 k), hot Wallet | 58.7 | **0.15** | Index Scan, no Sort |
| History, first page, cold Wallet | 51.6 | **0.19** | Index Scan |
| History, next page, cold Wallet | 55.1 | **0.23** | Index Scan |
| Balance, hot Wallet (95 k entries) | 54.9 | **13.1** | Index Only Scan, Heap Fetches 0 |
| Balance, cold Wallet (873 entries) | 51.6 | **0.25** | Index Only Scan |
| Payment list, first page, hot Merchant | 52.1 | **0.11** | Index Scan |
| Payment list, next page (deep), hot Merchant | 54.0 | **0.14** | Index Scan |
| Payment list, first page, cold Merchant | 25.2 | **0.14** | Index Scan |
| Payment list, next page (deep), cold Merchant | 24.4 | **0.19** | Index Scan |
| List `status=CREATED` (0.5%), hot / cold Merchant | 43.4 / 21.9 | 2.6 / 6.6 | Index Scan, status as residual filter |
| List `status=FAILED` (3%), hot / cold Merchant | 44.2 / 21.9 | 0.53 / 1.5 | Index Scan, residual filter |
| List with `accountId` (own Wallet), hot Merchant | 59.5 | **0.11** | Index Scan, residual filter |
| List with `accountId` (own Wallet), cold Merchant | 22.1 | 22.1 | Bitmap Heap Scan (planner misestimate, see section 4) |
| List with a 30-day period, hot / cold Merchant | 51.0 / 23.2 | 0.13 / 0.16 | Index Scan |
| Daily report, 30 days, hot / cold Merchant | 59.9 / 24.7 | 15.0 / 2.8 | Index Only Scan + aggregate |
| Daily report, 90 days, hot / cold Merchant | 89.9 / 30.5 | 31.8 / 8.3 | Index Only Scan + aggregate |
| Commit-time trigger, per Settlement commit | ~225–272 | **0.15–0.2** | Index Scan on `ledger_transaction_id` (section 3) |

Sizes after the migration: `ledger_entries_account_created_id_idx` 140 MB,
`ledger_entries_ledger_transaction_id_idx` 45 MB, `payments_merchant_created_id_idx` 74 MB; the database
grew from 729 MB to 987 MB. The migration applied to the 1.9 M-entry database in under 6 seconds.

Baseline plans, in words: history and Balance read the whole 183 MB `ledger_entries` heap in parallel
(with a top-N sort for history) for every Wallet, hot or cold; the Payment list used a bitmap scan of
the unique `(merchant_id, idempotency_key)` index and then sorted all of the Merchant's rows. Plans:
[plans/final-baseline.txt](plans/final-baseline.txt), [plans/final-adopted.txt](plans/final-adopted.txt).

## 2. Index variants, one at a time (history and Balance)

Same session, each variant created alone, `VACUUM (ANALYZE)` after, baseline re-run in that session
("V0e"). Times in ms; hot / cold Wallet. Sizes are of the index alone.

| Variant | History first page | History next page (deep) | Balance | Index size |
| --- | --- | --- | --- | ---: |
| V0e none | 96.2 / 83.7 | 97.2 / 89.9 | 90.5 / 83.6 | — |
| V1 `(account_id)` | 93.5 / 6.0 | 73.5 / 7.1 | 103.7 / 7.6 | 13 MB |
| V2 `(account_id, created_at DESC, id DESC)` | 0.21 / 0.38 | 0.34 / 0.50 | 106.8 / 7.7 | 107 MB |
| V2b V2 `INCLUDE (direction, amount)` | 0.21 / 0.40 | 0.29 / 0.50 | 28.2 / 0.51 | 140 MB |

- **V1** wins only for the cold Wallet (and the 6 ms is more than a plain index lookup because its
  873 entries sit on about as many heap pages). For the hot Wallet, 95 k entries is 5% of the table:
  the planner picks a parallel bitmap heap scan plus a 95 k-row top-N sort, no better than the
  sequential scan, and the hot Balance is *worse* (103.7 versus 90.5 ms).
- **V2** removes the Sort: `Limit -> Index Scan` reads 18 buffers for a page, whatever the depth or the
  Wallet. Its Balance is unchanged (heap fetches).
- **V2b** adds two INCLUDE columns and turns the Balance into an Index Only Scan (`Heap Fetches: 0`,
  897 buffers for the hot Wallet). It costs 33 MB more than V2.
- **Partial index on entries:** no query has a minority predicate, so there is nothing to try; the
  variant was not built. (Partial indexes on Payments: section 4.)
- A weakness to know: `Heap Fetches: 0` needs the visibility map. Pages written since the last VACUUM
  are not all-visible, so a Wallet under sustained writes reads those pages from the heap (in the
  contention runs of section 5 the hot Balance rose from 7.7 to 8.8 ms while inserting). Autovacuum
  keeps this bounded, and it never affects correctness.

## 3. The commit-time trigger (`ledger_transaction_id`), the T12 finding

`ledger_assert_transaction_balanced` (ADR 0003) runs three times per Settlement commit and each run reads
the entries of the transaction by `ledger_transaction_id`. Before the migration nothing indexed that
column.

Settlement-shaped pgbench transaction (one client, `synchronous_commit=off`, insert workload, 200
commits per size; database sizes seeded with the same generator):

| Entries in the ledger | COMMIT latency, no index | COMMIT latency, `ledger_transaction_id` index |
| ---: | ---: | ---: |
| 191,988 | 22.0 ms | 0.15 ms |
| 477,100 | 58.3 ms | 0.14 ms |
| 952,150 | 116.8 ms | 0.15 ms |
| 1,901,976 | ~225 ms (272 ms with `synchronous_commit=on`) | 0.13–0.16 ms |

The cost is linear in the ledger (about 0.12 ms per thousand entries, three scans per commit), and it
is paid inside the Settlement transaction while the source Wallet lock (ADR 0002) is held. Baseline
throughput of any single Wallet was therefore about 3.5 Settlements per second (section 5), of which
the commit was about four fifths. The index removes it: about 1,000 commits per second in the insert workload
at every size. Raw: [raw/scale.txt](raw/scale.txt). Sizes 192 k to 952 k came from separate scratch
databases (`bench:seed --payments N` against a `paylab_bench_scale` database, then dropped).

## 4. Payments: list, report, and the partial index

Same session as section 2 (baseline re-run in the same session for the list; hot / cold Merchant).

| Query | none | V3 `(merchant_id, created_at DESC, id DESC)` 56 MB | V3b V3 `INCLUDE (status, amount)` 74 MB | V3c V3 + partial `WHERE status <> 'SUCCEEDED'` 2.9 MB |
| --- | --- | --- | --- | --- |
| First page | 118 / 34 | 0.17 / 0.26 | 0.19 / 0.27 | — |
| `status=CREATED` | 92 / 37 | 5.0 / 15.4 | 5.3 / 15.8 | **1.5 / 2.0** |
| `status=FAILED` | 93 / 45 | 1.1 / 3.3 | 1.1 / 3.2 | 0.30 / 0.43 |
| Report 30 days | 123 / 52 | 60.7 / 20.4 | **30.8 / 5.7** | — |
| Report 90 days | 137 / 63 | **184 / 63** | 63.0 / 16.3 | — |

- A plain composite index makes the *90-day hot Merchant report worse* than baseline (184 versus 137 ms):
  it walks 60 k index entries and fetches 60 k heap rows. With `INCLUDE (status, amount)` the report is an
  index-only scan and the aggregate becomes the cost (section 1: 32 ms hot, 8 ms cold). That is why the
  adopted index carries the INCLUDE columns.
- Status changes already make every Payment update non-HOT (`ledger_transaction_id` is unique-indexed and
  is set at Settlement), so having `status` in the index adds no HOT loss beyond what exists.
- The partial index works (7 times faster on rare statuses; the planner proves `status = 'CREATED'`
  implies `status <> 'SUCCEEDED'`) but the composite index already keeps the worst measured list at
  15 ms (cold Merchant, 0.5% status, scanning about 4,000 index entries), and the cost of that case grows
  with the Merchant's rows, not with the ledger. Rejected for now, see ADR 0007.

**A planner misestimate that the index does not fix** (cold Merchant, list with `accountId`): with `accountId`, the planner estimates 9 rows for
`source_account_id = $x OR destination_account_id = $x` (actual 537), so it picks a bitmap scan of the Merchant's
rows plus a sort (22 ms) instead of walking the index in order and stopping at 21 matches. Forcing
`enable_bitmapscan = off` as a diagnostic gave 1.6 ms. This is a statistics limit, not an index defect;
it is not fixed here (a query rewrite would change [reads-sql.md](../reads-sql.md); logged as a follow-up).

## 5. Write cost and Settlement under contention

**Write cost.** A fresh scratch clone per variant, warm-up, then three runs of 1,500 transactions, one client,
`synchronous_commit=off` (WAL fsync is about 4 ms on this disk and otherwise hides everything).
Each transaction is a Settlement without lock and Balance: Ledger Transaction, two entries, Payment
insert and its update to SUCCEEDED, and the deferred triggers at commit. Raw: `raw/w-a.txt`, `raw/w-b.txt`, `raw/w-simple.txt`.

| Variant (all include the `ledger_transaction_id` index unless stated) | tps (3 runs) | `INSERT ledger_entries` ms |
| --- | --- | --- |
| W1 `ledger_transaction_id` only | 834, 825, 844 | 0.19–0.20 |
| W1s + `(account_id)` | 813, 837, 808 | 0.27–0.29 |
| W2 + entries composite INCLUDE | 811, 802, 817 | 0.22–0.24 |
| W2p + entries composite, no INCLUDE | 766, 798, 916 | 0.29–0.41 |
| W3 W2 + payments composite | 774, 845, 845 | 0.26 |
| W4 W2 + payments composite INCLUDE (**adopted**) | 819, 821, 830 | 0.22–0.24 |
| W5 W3 + partial open-status | 742, 796, 821 | 0.36–0.47 |

Run-to-run noise on one variant is about ±5% (W2p and W5 spread the most), so no index is
distinguishable from another by throughput; the adopted set (W4) is within about 2% of the
`ledger_transaction_id`-only baseline. The statement latency of the entries insert rises from about 0.20 ms
to 0.23 ms with the covering index. The no-index case is not comparable in tps (its commit is 225 ms).

**Settlement including the lock and the Balance** (skewed Wallet mix, one client, same protocol):
W1 18.9 tps (Balance 51 ms), W2 154 tps (Balance 4.6 ms), W2p 43.6 tps (Balance 18.8 ms), W1s 45 tps
(Balance 18.7 ms). The covering index is 3.5 times faster than the non-covering composite and 8 times
faster than `ledger_transaction_id` alone.

**One hot Wallet, every Settlement debits it** (`settle-hot.pgbench`, `FOR NO KEY UPDATE`, Balance, insert,
commit; `synchronous_commit=off`; clients 1 / 4 / 16):

| Schema | tps | average latency | waiting for the lock |
| --- | --- | --- | --- |
| Baseline | 3.5 / 3.5 / 3.6 | 285 / 1,147 / 4,407 ms | 836 ms / 3.8 s (4 / 16 clients) |
| Adopted | 95 / 73 / 83 | 10.5 / 55 / 193 ms | 41 ms / 180 ms |

The throughput of a hot Wallet is `1 / lock hold time` (ADR 0002 serializes debits of one Wallet by
design); the adopted schema cuts the hold time from about 285 ms to about 10 ms (Balance 8 ms plus inserts)
and the rate rises about 25 times. This is the baseline that T14 compares other strategies against.

**Balance under contention.** With a session holding `FOR NO KEY UPDATE` on the hot Wallet row for 25 s, the
Balance took 14.2 ms (median of 7) versus 14.1 ms alone, the history first page 0.12 ms: reads never wait
on that lock (MVCC). The lock only serializes writers that lock (debits), as ADR 0002 states.

## 6. Keyset versus offset (hot Wallet history, first page of 21)

| Rows skipped | Baseline keyset | Baseline offset | Adopted keyset | Adopted offset |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 57.7 | 57.8 | 0.11 | 0.11 |
| 1,000 | 61.5 | 61.9 | 0.15 | 0.68 |
| 10,000 | 61.2 | 64.9 | 0.13 | 5.3 |
| 50,000 | 58.9 | 68.1 | 0.14 | **77.9** |
| 90,000 | 56.4 | 73.0 | 0.17 | **81.1** |

Without the index the difference is hidden (both read the table). With it, keyset is flat: the plan is
`Limit -> Index Scan` with `Index Cond: (account_id = ... AND ROW(created_at, id) < ROW(...))`, 15 buffers
at any depth ([plans/depth-adopted.txt](plans/depth-adopted.txt)). Offset grows about linearly (0.11, 0.68,
5.3 ms) and then the planner **switches** to a Bitmap Heap Scan of all 95 k rows plus a 90 k-row Sort
(24,000 buffers, 78–81 ms): a cost cliff, not the linear extrapolation hypothesized.

**Balance versus the size of one Wallet** (index-only scan, scratch clone with the hot Wallet inflated
by inserting extra entries with the user triggers disabled, a read-scaling measurement only, not a dataset;
history stays 0.11 ms at every size):

| Entries of the Wallet | Balance |
| ---: | ---: |
| 95,496 | 13.2 ms |
| 495,496 | 55.9 ms |
| 995,496 | 108.5 ms |

Linear, about 0.11 ms per thousand entries.

## 7. Materialization decision (proposal only)

With the adopted schema the hottest Wallet in the dataset (95 k entries) has a Balance of 13 ms and a lock
hold of about 10 ms; the Balance grows linearly with the Wallet (108 ms at 1 M entries, so about 9
Settlements per second on such a Wallet). A materialized Balance is not justified by the measurements at
this scale. See [ADR 0009](../adr/0009-no-materialized-balance-for-september.md) for the trigger points.

## 8. Scorecard against the hypotheses

| | Hypothesis (written first) | Result |
| --- | --- | --- |
| H0 | Sequential scan about 100 ms for hot and cold alike | Held in shape (Wallet-independent full scan); magnitude 52–98 ms depending on session |
| H1 | Simple index wins cold (1–3 ms), no win on hot | Held; cold was 6–8 ms, not 1–3 (scattered heap pages); hot Balance got worse |
| H2 / H2b | Composite < 1 ms; INCLUDE makes Balance index-only (hot 20–35 ms, cold < 1 ms; 1.4 times the size) | Held: 0.1–0.5 ms; Balance 13–28 ms hot, 0.25–0.5 cold; 1.31 times the size |
| H3 | Partial index rejected | Mixed: measurably useful on rare statuses (15 → 2 ms cold) but rejected on cost/benefit, not on failing a gate |
| H4 | Keyset flat; offset linear with depth, difference visible only with the index | Keyset and the "hidden without index" parts held; offset was **not linear**: a plan flip made it a cliff at 50 k rows |
| H5 | Baseline list is a sequential scan at 150–250 ms; composite < 1 ms; report hot 30 d 20–50 ms; INCLUDE about halves it | **Baseline wrong:** the planner used the unique index bitmap scan, 52 / 25 ms (118 / 34 in session 1). Composite and INCLUDE predictions held; the plain composite made the 90-day report worse than baseline, which was not predicted |
| H6 | Trigger scans cost 100–300 ms per commit, linear in the ledger; index makes it < 0.1 ms | Held: 225–272 ms, linear (22 / 58 / 117 / 225 ms), 0.15 ms with the index (slightly above the 0.1 ms guess) |
| H7 | Balance is not blocked by the lock; materialization not justified at this scale | Held; also measured the linear growth, see ADR 0009 |
| H8 | A few percent write cost per index; H6's index makes Settlement faster | Held: within noise (±5%); the `ledger_transaction_id` index makes commits about 1,500 times faster |

## 9. Limits of these results

- One machine, one dataset, single database session per query; no concurrent read load during timings
  except the deliberate contention runs. Warm cache only; a cold cache would show larger absolute gaps
  because the baseline reads 258 MB and the adopted plans read a few pages.
- The Zipf-skewed pgbench mix is a model, not the benchmark dataset's own distribution.
- `synchronous_commit=off` isolates CPU and index cost; it hides WAL fsync latency, which is common to all
  variants.
- The session drift described under "Integrity of the experiment" is unexplained; ratios within a session are the evidence.
