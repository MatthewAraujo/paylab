# T14 — Concurrency strategy comparison: results

Decision: [ADR 0010](../adr/0010-confirm-source-wallet-row-lock-after-strategy-comparison.md) (confirms
[ADR 0002](../adr/0002-exclusive-source-lock-for-balance-consumers.md)). Hypotheses and method:
[T14-concurrency-strategies.md](T14-concurrency-strategies.md). Raw output: [raw/](raw/) (`T14-load.jsonl` is the
v2 run reported here, `T14-summary-tables.md` its full tables, `T14-correctness.txt` the correctness bar).
Experiment code: `bench/exp/strategies/` only (`strategies.ts`, `db.ts`, `correctness.ts`, `load.ts`,
`run-matrix.sh`, `summarize.py`); nothing under `src/` changed and nothing from `bench/` is in `dist/`.

## Integrity of the experiment

- The hypothesis document was written and hashed **before the first measurement**:
  `sha256 265b4fd00528a70ea81eb76ea19365d334340b11dea5c10bd7c66f020f79ddea`, 2026-09-23T20:18Z (see
  `raw/T14-hypotheses.sha256`; the file has not been edited since, and the scorecard below judges it as written).
- Machine: AMD Ryzen 7 5825U (8 cores, 16 logical CPUs), 15 GiB RAM, Linux 7.0.0-31. PostgreSQL 16.15
  (postgres:16-alpine, Docker), `shared_buffers=1GB`, `work_mem=32MB`, `effective_cache_size=3GB`,
  `max_wal_size=4GB`, default `deadlock_timeout=1s`, `max_connections=100`. Driver: Node 24.5.0 with `pg`, on the same
  host as the database. Dataset: T12 full run in the T13 `adopted` schema (1.90 M entries, 1.00 M Payments, 1,000
  Wallets, 50 Merchants; hot Wallet 95,496 entries).
- The machine was otherwise idle except the desktop session (a browser using about 20% of one core and a second,
  unrelated idle PostgreSQL container). No test suite, build or other lane ran during measurement; tests and the build
  ran after the last measurement. That background load is recorded because it cannot be removed; it is one reason only
  same-session ratios are used.
- Method: closed loop, one connection per virtual client, Payments pre-created in batches of 50 outside the timed
  Settlement, amount R$ 1.00, all Wallets topped up first. v2: 2 s warm-up, 10 s window, 3 repetitions per cell,
  **median of the repetitions** reported with the range of tps, database restored from the `adopted` template before every
  block of five strategy runs, strategies in a Latin-square rotation. Retry loops are bounded at 50 attempts; a
  transaction that exhausts them is counted as `exhausted` and is not counted as a success.
- Cache state: warm (buffers prewarmed, 2 s warm-up).

### Why there are two runs (v1 discarded, v2 reported)

The first full run (v1, 12 s windows, `synchronous_commit=on` plus one `off` cell) is kept as
`raw/T14-load-v1.jsonl` and `raw/T14-summary-tables-v1.md`, but **not used**, for two reasons found in its data:

1. **Rotation aliasing.** The strategy order was rotated per block, but a repetition had ten blocks, a multiple of the
   five strategies, so every cell had the *same* strategy first (cold buffers after the database restore) in all three
   repetitions. That showed up as the H/4 `nokey` cell at 51 tps against 90 for `advisory` (same mechanism, same
   workload), and the H/16 `forupdate` cell ranging 13 to 50 tps.
2. **Bimodal commit-flush latency.** With `synchronous_commit=on`, single-statement commit latency on this laptop swung
   between about 3 ms and 11 ms from run to run (W/4 `forupdate` 1,088 tps against about 360 for every other strategy;
   W/16 `optimistic` 2,323 against about 1,250). With uncontended work that difference is entirely fsync, not strategy.

v2 changed only the design: a rotation whose first strategy differs in every repetition, both commit modes in every
cell (`off` is the primary comparison because it removes the flush noise and isolates the concurrency mechanism; `on`
is reported as the durable-default sensitivity), 10 s windows, and the cell set trimmed to H{4,16,64}, W{16,64},
M{4,16,64}. Hypotheses and strategy code are unchanged. Even in v2 the `on` cells keep wide ranges (see the ranges in
the tables); conclusions rest on `off` and on differences much larger than the `on` noise.

## 1. Correctness bar (T10 scenarios per strategy, then the global invariant helper)

Run on fresh Wallets in the benchmark database (`bench/exp/strategies/correctness.ts`; raw: `raw/T14-correctness.txt`):
S1 50 parallel debits of R$ 10 from R$ 100; S2 25 randomized overspend rounds; S3 40 rounds of 12 crossed transfers
A to B and B to A; S4 10 rounds of 20 debits racing 30 credits on one Wallet.

| Strategy | Result | Retries per scenario S1 / S2 / S3 / S4 | Notes |
| --- | --- | --- | --- |
| `nokey` (baseline) | pass | 0 / 0 / 0 / 0 | no retries, no deadlocks |
| `forupdate` (control) | **FAIL** | 0 / 0 / **3,413 deadlocks** / 0 | S3 deadlocks, see below |
| `serializable` | pass | 409 / 1,161 / 2,703 / 2,528 | correct only because it aborts and retries |
| `optimistic` | pass | 223 / 1,312 / 1,200 / 1,810 | version read in the same statement as the Balance, checked last |
| `advisory` | pass | 0 / 0 / 0 / 0 | |

The invariant helper (sum of entries zero, no negative Wallet Balance) was clean after every strategy; the only
failure is `forupdate` in S3, and it is a deadlock, not a wrong Balance.

**Why `FOR UPDATE` deadlocks (not predicted in the hypotheses).** A Settlement holds `FOR UPDATE` on its source and then
inserts a Ledger Entry crediting its destination, which takes `FOR KEY SHARE` on the destination row through the foreign
key. `FOR UPDATE` conflicts with `FOR KEY SHARE`. Two crossed transfers A to B and B to A therefore each hold one row and
wait for the other: a lock cycle that PostgreSQL resolves by aborting one after `deadlock_timeout` (1 s). The S3 run
recorded 3,413 such aborts, and the correctness run as a whole took 15 min 46 s, almost all of it `forupdate` waiting for deadlock detection. With
`FOR NO KEY UPDATE` the two lock modes do not conflict, so the cycle cannot form: this is the
guarantee that ADR 0002 stated ("cannot deadlock") and that T10 tested, now shown to depend on the weaker mode, not only
on locking a single row. The timing shapes do not contain crossed pairs, so `forupdate` shows no deadlocks below.

## 2. Timing results (median of 3 repetitions; full tables in `raw/T14-summary-tables.md`)

tps is Settlements that succeeded per second; latencies are end-to-end including retries; "attempts" is attempts per
success; "acquire" is the client-side latency of the lock statement (for `optimistic` the version `UPDATE`, none for
`serializable`); "waiters" is the average number of backends waiting on a heavyweight lock, sampled every 25 ms.

### H — every client debits the hot Wallet (95k entries), `synchronous_commit=off`

| Clients | Strategy | tps | p50 / p99 ms | attempts | ser. fail / ver. conflicts | exhausted | acquire mean ms | waiters |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | **nokey** | 101.3 | 39 / 43 | 1 | 0 | 0 | 29 | 2.9 |
| 4 | forupdate | 101.0 | 39 / 42 | 1 | 0 | 0 | 29 | 3.0 |
| 4 | advisory | 104.4 | 38 / 41 | 1 | 0 | 0 | 28 | 3.0 |
| 4 | optimistic | 95.6 | 10 / 421 | 3.6 | 2,428 | 9 | 0.7 | 0.0 |
| 4 | serializable | 68.4 | 14 / 588 | 3.7 | 1,828 | 16 | — | 0 |
| 16 | **nokey** | 101.4 | 155 / 173 | 1 | 0 | 0 | 145 | 14.9 |
| 16 | forupdate | 98.6 | 159 / 172 | 1 | 0 | 0 | 148 | 14.9 |
| 16 | advisory | 104.2 | 151 / 175 | 1 | 0 | 0 | 141 | 15.0 |
| 16 | optimistic | 48.1 | 26 / 1,077 | 14.2 | 6,356 | 40 | 5.6 | 0.0 |
| 16 | serializable | 32.1 | 33 / 1,478 | 14.0 | 4,086 | 39 | — | 0 |
| 64 | **nokey** | 98.8 | 607 / 628 | 1 | 0 | 0 | 598 | 62.9 |
| 64 | forupdate | 95.2 | 628 / 648 | 1 | 0 | 0 | 620 | 63.0 |
| 64 | advisory | 89.7 (47–99) | 604 / 680 | 1 | 0 | 0 | 655 | 62.9 |
| 64 | optimistic | 16.4 | 1,079 / 4,473 | 25.1 | 3,972 | 34 | 69 | 0.2 |
| 64 | serializable | 12.5 | 1,020 / 5,801 | 18.9 | 2,275 | 15 | — | 0 |

The three lock strategies serialize the Wallet at about 100 Settlements per second regardless of client count (a hold
time of about 10 ms, dominated by the Balance read), and latency is the queue: p50 is about `clients x 9.8 ms`
(39, 155 and 607 ms). Lock wait is 94% to 98% of the latency at 16 and 64 clients. The two abort-based strategies
finish shorter transactions (p50 26 ms) but at a third or less of the throughput, with tens of retries per success and
Settlements that never complete within 50 attempts.

With `synchronous_commit=on` (durable default) the same shape gives, medians with ranges (the range is the noise):
16 clients `nokey` 84.5 (72.7–91.2), `forupdate` 88.9 (14.6–92.8), `advisory` 71.2 (47.9–87), `optimistic` 32.3,
`serializable` 25.0; 64 clients `nokey` 57 (43–63), `forupdate` 43.7, `advisory` 43.4, `optimistic` 13.6,
`serializable` 11.0. The ranking between the three lock strategies is not resolvable on this machine with flush on; the
gap to the two abort-based strategies (2.5x to 5x) is.

### W — 1,000 Wallets, almost no contention

| Clients | Strategy | tps `off` | p50 / p99 ms `off` | attempts `off` | ser. fail `off` | tps `on` (range) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 16 | **nokey** | 3,023 | 5.0 / 15.8 | 1 | 0 | 1,693 (1,277–2,648) |
| 16 | forupdate | 2,976 | 5.0 / 15.2 | 1 | 0 | 1,690 (1,623–2,075) |
| 16 | advisory | 2,993 | 5.0 / 9.0 | 1 | 0 | 1,288 (1,239–1,301) |
| 16 | optimistic | 2,828 | 5.2 / 16.6 | 1.01 | 0 (290 version conflicts) | 1,252 (1,225–2,525) |
| 16 | serializable | **524** | 10.1 / 87.5 | 3.7 | 15,406 | 417 |
| 64 | **nokey** | 2,576 | 21.2 / 48.9 | 1 | 0 | 2,383 |
| 64 | forupdate | 2,616 | 19.5 / 64.9 | 1 | 0 | 2,265 |
| 64 | advisory | 2,643 | 20.8 / 47.9 | 1 | 0 | 2,462 |
| 64 | optimistic | 2,454 | 21.6 / 71.9 | 1.04 | 0 (1,000 conflicts) | 2,293 |
| 64 | serializable | **165** | 111 / 1,113 | 15.1 | 23,273 | 112 |

Without contention the four lock/version strategies are within about 7% of each other (the ordering is inside noise;
`optimistic` is consistently 5% to 7% lower in the `off` cells: the extra version `UPDATE` and the occasional retry).
`serializable` collapses even though no two in-flight Settlements share a source Wallet: 17% of the baseline at 16
clients and 6% at 64, with 122 (`on`) to 139 (`off`) Settlements per 10 s window exhausting 50 attempts at 64 clients.

**Why `serializable` aborts with no logical conflict.** Sampling `pg_locks` while the W shape ran at 16 clients showed
the SIRead (predicate) locks of the running transactions: 282 `page` locks on `ledger_entries_account_created_id_idx`,
**33 relation-level** locks on `ledger_entries`, relation-level locks on `merchants`, 52 tuple locks on `accounts`,
plus page locks on the primary keys. Serializable Snapshot Isolation tracks reads at index-page granularity and promotes
many fine locks to coarser ones (`max_pred_locks_per_page = 2`, `max_pred_locks_per_transaction = 64`). A relation-level
read lock on `ledger_entries` makes every concurrent insert into that table a read-write dependency, so unrelated
Wallets form dangerous structures and are aborted. Raising the predicate-lock limits could reduce this; that is a
server-wide memory setting and was not tested here.

### M — hot Wallet, 50% debits and 50% credits into it, `synchronous_commit=off`

Debit tps and latency (the Settlements that contend) plus credit tps and credit latency (the flow ADR 0002 wants unblocked):

| Clients | Strategy | debit tps | debit p50 / p99 ms | credit tps | credit p50 / p99 ms | attempts | exhausted |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | **nokey** | 91.5 | 42 / 47 | 90.3 | 1.3 / 1.7 | 1 | 0 |
| 4 | forupdate | 87.5 | 26 / 45 | 92.2 | 19 / 35 | 1 | 0 |
| 4 | advisory | 95.9 | 40 / 45 | 98.4 | 1.3 / 1.7 | 1 | 0 |
| 4 | optimistic | 84.0 | 11 / 387 | 81.4 | 1.4 / 1.9 | 2.4 | 1 |
| 4 | serializable | 58.9 | 15 / 666 | 56.3 | 1.4 / 2.0 | 2.5 | 13 |
| 16 | **nokey** | 94.5 | 165 / 189 | 96.8 | 1.3 / 1.8 | 1 | 0 |
| 16 | forupdate | 86.1 | 100 / 140 | 87.0 | **91 / 134** | 1 | 0 |
| 16 | advisory | 99.4 | 157 / 169 | 101.8 | 1.3 / 1.8 | 1 | 0 |
| 16 | optimistic | 45.0 | 135 / 990 | 48.2 | 3.5 / 7.6 | 7.5 | 30 |
| 16 | serializable | 25.3 | 35 / 1,676 | 33.1 | 3.5 / 9.2 | 7.7 | 44 |
| 64 | **nokey** | 93.2 | 642 / 656 | 95.8 | 1.3 / 1.9 | 1 | 0 |
| 64 | forupdate | 85.9 | 371 / 463 | 88.4 | **363 / 463** | 1 | 0 |
| 64 | advisory | 95.4 | 626 / 649 | 102.1 | 1.4 / 1.9 | 1 | 0 |
| 64 | optimistic | 15.4 | 1,193 / 4,940 | 25.2 | 25 / 159 | 10.9 | 25 |
| 64 | serializable | 7.8 | 1,482 / 5,634 | 14.7 | 19 / 54 | 7.9 | 10 |

With `synchronous_commit=on`, 16 clients, medians: credit p50 `nokey` 2.0 ms, `advisory` 2.8 ms, `optimistic` 11.6 ms,
`serializable` 13.6 ms, `forupdate` **201.6 ms**; credit tps `nokey` 90, `forupdate` 38.5 (57% lower, wide range).

The credit latency under `FOR UPDATE` is the effect ADR 0002 predicted: a credit's foreign-key `FOR KEY SHARE` queues
behind the debit holding the lock and behind the debits already queued, so it waits about as long as the debit queue
(91 ms at 16 clients, 363 ms at 64, against 1.3 ms). Credits still complete in a closed loop, so credit throughput falls
by 10% (`off`) to about half (`on`, noisy), and debit throughput is 9% lower at 16 clients.

### Sensitivity: commit flush

Hot-Wallet lock strategies move from about 71–89 tps (`on`, wide ranges) to a steady 99–104 (`off`) at 16 clients: the
flush inside the lock adds hold time. The ranking between strategies does not change with the commit mode.

## 3. Hypothesis scorecard (hypotheses as written before measuring)

| | Hypothesis | Outcome |
| --- | --- | --- |
| H0 | All five keep the ledger balanced and Balances non-negative | **Mostly held.** Four passed. `forupdate` failed with 3,413 deadlocks in the crossed-transfer scenario (not predicted; the Balance and ledger stayed correct, it is a liveness failure) |
| H1 | Lock strategies flat in clients at about `1/hold time`, roughly 50 to 70 per second; latency linear; `nokey`, `forupdate`, `advisory` equal in shape H | **Held in shape, magnitude wrong.** Flat at about 100 per second (hold about 10 ms, not 15–20); p50 is `clients x 9.8 ms`; the three are equal within about 5% (with flush off) |
| H2 | `serializable` hot goodput 20% to 60% of the baseline at 16 clients, attempts per success about half the client count, worse p99, retry exhaustion only at 64 clients | **Goodput held** (32% with flush off, 30% on). **Attempts wrong**: 14 to 19 per success at 16 clients (above the client count, not half). **Exhaustion wrong**: 39 to 44 exhausted at 16 clients, not only at 64 |
| H3 | `optimistic` hot: below the baseline, comparable to or slightly better than `serializable`; close to baseline at 4 clients | **Held.** 4 clients 96 vs 101; 16 clients 48 vs 32 tps; 64 clients 16 vs 12.5 (better than `serializable`, far below the baseline) |
| H4 | Wide shape: all within about 10%; `serializable` overhead 10–30% with occasional false positives; `optimistic` and `advisory` equal to baseline | **Held for `nokey`, `forupdate`, `advisory`, `optimistic` (within 7%). Wrong for `serializable`**: 83% to 94% loss and 15 to 23 thousand serialization failures, from predicate-lock promotion, not from logical conflicts |
| H5 | Credits unblocked with `nokey`/`advisory`/`optimistic`; `forupdate` credits wait as long as the debit queue and credit throughput falls; `serializable` credits rarely abort | **Held** for latency (1.3 ms vs 91 to 363 ms). Credit throughput fell less than predicted with flush off (10%). Credit abort counts were not recorded separately from debit retries, so the last clause is untested |
| H6 | Flush off raises hot lock-strategy throughput, ranking unchanged | **Held** (about 71–89 to 99–104 per second, ranking unchanged; the flush-on cells are noisy) |
| H7 | Decision rule: confirm ADR 0002 if `nokey` is at least 90% of the best alternative in H and M with p99 no worse than twice the best, within noise in W, and it is *the only one* keeping credits unblocked without retries | **Confirm.** H/16 `off`: `nokey` 101.4 vs best 104.2 (97%); M/16 `off`: 94.5 vs 99.4 (95%); W within noise; p99 within 12% of the best (M/16 `off`: 189 vs 169 ms). **The last clause was wrong:** `advisory` also keeps credits unblocked without retries, so the tie is broken on other grounds (ADR 0010) |

## 4. Failure modes recorded

- `forupdate`: deadlock between crossed transfers through `FOR KEY SHARE` on the destination (3,413 in 40 rounds).
- `serializable`: no incorrect result, but livelock-like retry storms on one hot Wallet (14–20 attempts per success at
  16 clients, up to 50 and exhausted) and, more surprisingly, on a low-contention workload (false positives from
  predicate-lock promotion). Retry exhaustion turns into failed requests unless the caller retries further.
- `optimistic`: correct, but under contention nearly all work is thrown away: a Settlement reads the 10 ms Balance, does its
  writes, then waits on the row lock taken by the version `UPDATE` until the winner commits, and only then learns it lost.
  Every loser retries the whole transaction.
- `advisory`: correct with cooperating code; no failure was provoked, and none can be by construction only where every
  writer takes the lock (see below).

## 5. Advisory-lock key and collision considerations

The experiment key is `hashtextextended(account_id::text, 0)`, a 64-bit hash of the Account id, used with
`pg_advisory_xact_lock(bigint)` (released at commit or rollback, so it cannot leak). Two Accounts whose hashes collide
would share one lock: extra waiting, never a wrong result. At 1,000 Wallets the probability is about
`1000^2 / 2^65`, negligible; at 10 million Accounts about 0.3%, harmless. The genuine hazards are different in kind:
(1) advisory locks live in a database-wide keyspace shared with every other advisory user (extensions, other services,
the two-int form's 32-bit namespace), so a key collision with unrelated code is possible and is silent;
(2) they protect only code that asks for them, so a script, migration or future code path that writes entries
without taking the lock is not excluded, unlike a row lock which every writer of that row's dependents already meets;
(3) they are not visible in row-oriented tooling (`pg_locks` shows them as `advisory`, not as a row). The measurement
shows no performance gain from paying for these hazards.

## 6. Notes and limits

- Closed-loop driver on the same host as PostgreSQL; the absolute numbers are this machine on this day (only same-session
  ratios matter). The hot-Wallet ceiling of about 100 per second is the Balance read (about 10 ms) and moves with the
  Wallet's entry count as ADR 0009 describes.
- The Payment row is created in a separate transaction outside the timed Settlement, as the application does.
- `optimistic` was implemented with the version bump last and the version read in the same statement as the Balance. A
  variant that bumps the version first is the baseline row lock with extra steps and was not measured.
- The predicate-lock diagnosis is from one sampled snapshot of `pg_locks`; the tuning of `max_pred_locks_*` is untested.
- Baseline production code was not modified; the experiment settlement runs the same SQL on a plain connection and is
  not the Prisma adapter (the correctness bar for the real adapter remains the T10 suite, unchanged).
