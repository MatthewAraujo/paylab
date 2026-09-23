# T14 — Concurrency strategy comparison: hypotheses and method

Written **before any measurement** (hash and timestamp recorded in [T14-results.md](T14-results.md)).
Baseline under test: ADR 0002 (`SELECT ... FOR NO KEY UPDATE` on the source Wallet, `READ COMMITTED`, Balance
computed from the ledger under the lock). Schema state: adopted (ADRs 0005 to 0007), from `bench/exp/reset.sh adopted`.
Starting facts from T13 that shape the hypotheses: the Balance of the hot Wallet costs about 13 ms (index-only scan,
~95k entries), and COMMIT is about 0.15 ms after ADR 0005, so the time a debit holds the lock is dominated by the
Balance read plus the commit flush.

## Strategies

| Id | Strategy | How it decides |
| --- | --- | --- |
| `nokey` | **Baseline**, ADR 0002 | `FOR NO KEY UPDATE` on the source Wallet row, `READ COMMITTED` |
| `forupdate` | **Control** | same, but `FOR UPDATE` (conflicts with the foreign key's `FOR KEY SHARE`, so it blocks credits) |
| `serializable` | Serializable + retry | `SERIALIZABLE`, no explicit lock, retry on SQLSTATE 40001/40P01 (counted) |
| `optimistic` | Optimistic versioning | `READ COMMITTED`, no lock while working; read `version` and Balance in one statement, do the writes, then `UPDATE accounts SET version = version + 1 WHERE id = $1 AND version = $2`; zero rows means conflict, roll back and retry (counted). Needs `accounts.version`, added only to the scratch benchmark database, never shipped |
| `advisory` | Advisory lock per Account | `pg_advisory_xact_lock(hashtextextended(account_id::text, 0))`, `READ COMMITTED` |

Every strategy runs the same Settlement-shaped work in the same order: claim the Payment (`CREATED` to
`PROCESSING`), decide funds (lock or not, per strategy), insert the Ledger Transaction and two entries, mark the
Payment `SUCCEEDED`. The Payment row is created beforehand in its own transaction, as the application does. Only the
concurrency mechanism differs. Credits into a Wallet from the External Clearing Account take no lock and run no funds
check, in every strategy except `serializable` (where every transaction is serializable) and `optimistic` (which does
not touch the version for credits, because a credit can never make a debit overspend).

## Correctness bar (before any timing)

The T10 scenarios, run per strategy against the benchmark database on freshly created Wallets, with the global
invariant helper afterwards: 50 parallel debits of R$ 10 from R$ 100 (exactly 10 succeed, 40 `INSUFFICIENT_FUNDS`,
Balance zero); 25 randomized overspend rounds; crossed transfers A to B and B to A, many rounds, all resolve with no
deadlock; debits racing credits on one Wallet (final Balance equals credits minus successes). A strategy that fails
records exactly how.

**H0 (correctness).** All five keep the ledger balanced and Balances non-negative. `serializable` does so by aborting
(and the retry loop absorbs it); `optimistic` does so only because the version is read in the same statement as the
Balance and checked last. A separate-statement read would fail (not tested, reasoning only).

## Load shapes

Driver: a Node process with one `pg` connection per virtual client, closed loop (each client issues the next
Settlement as soon as the previous one completes). PostgreSQL 16 in Docker, `synchronous_commit=on` (the default the
benchmark container keeps on purpose). 2 s warm-up, then 12 s measured, 3 repetitions per cell, **median of repetitions**
reported, database restored from the `adopted` template before each block of strategy runs (the ledger is append-only,
so runs cannot be undone; strategies run in a rotated order inside each block so growth is spread evenly). All
Wallets are topped up first so funds never run out in the timing shapes (the failure path has its own correctness test).
Amount R$ 1.00.

| Shape | Traffic | Clients |
| --- | --- | --- |
| **H** hot | every client debits the single hottest Wallet (95k entries); destination uniform over the other Wallets | 4, 16, 64 |
| **W** wide | source and destination uniform over 1,000 Wallets, so almost no two in-flight debits share a source | 4, 16, 64 |
| **M** mixed on the hot Wallet | 50% debits from the hottest Wallet, 50% credits into it from the External Clearing Account | 4, 16, 64 |

Extra sensitivity cell: shape H at 16 clients with `synchronous_commit=off`, to see how much of the result is commit flush.

Metrics per cell: Settlements per second (goodput), end-to-end latency p50/p95/p99 including retries (credits and debits
separately in M), attempts per success and abort/retry counts, lock-acquire latency (time of the lock statement for
`nokey`/`forupdate`/`advisory`, of the version `UPDATE` for `optimistic`, none for `serializable`), and the average
number of backends waiting on a heavyweight lock sampled from `pg_stat_activity` every 25 ms.

## Hypotheses

**H1 (hot debits, shape H).** The three lock-based strategies serialize debits on the Wallet: throughput is flat in
the client count at about `1 / hold time` (Balance read ~13 ms plus insert and commit, so roughly 50 to 70 per second),
and latency grows linearly with clients (p50 about `clients x hold time`). `nokey`, `forupdate` and `advisory` are
equal within noise, because only debits touch the source and they queue identically. Advisory adds one cheap function
call.

**H2 (serializable, hot).** Every pair of concurrent debits on the same Wallet is a read-write cycle, so only about one
debit per overlapping group commits and the rest abort after doing the 13 ms Balance read. Goodput at 16 clients is
**below the baseline** (I expect 20% to 60% of it), attempts per success grows with clients (well above 1, on the order
of half the client count), p99 is far worse than baseline, and some transactions exhaust a bounded retry count at 64
clients. It burns CPU on work that is thrown away.

**H3 (optimistic, hot).** Same collision structure as serializable: all clients read Balance concurrently and the
version `UPDATE` admits one winner per round, the others wait for the winner's commit on the row lock and then match
zero rows. Goodput at 16 and 64 clients is below the baseline and roughly comparable to or slightly better than
serializable; at 4 clients it is close to the baseline. Attempts per success grows with clients.

**H4 (wide, no contention, shape W).** All strategies deliver the same throughput within about 10%, limited by commit
flush and CPU, with retries near zero. `serializable` pays a small bookkeeping overhead (10% to 30%) and may show
occasional false-positive aborts caused by predicate locks being taken at index-page granularity when unrelated Wallets
share an index page. `optimistic` and `advisory` are equal to the baseline.

**H5 (credits on a hot Wallet, shape M).** With `nokey`, `advisory` and `optimistic`, credits are not blocked by
in-flight debits: credit latency stays near the uncontended commit latency. With the `forupdate` control, a credit's
foreign-key `FOR KEY SHARE` queues behind the debit holding `FOR UPDATE` and behind the debits queued after it, so
credit latency rises to the order of the debit queue (several times the baseline p50) and credit throughput falls.
`serializable` credits rarely abort themselves but cause more debit aborts than in H2.

**H6 (commit flush).** With `synchronous_commit=off` the hot-Wallet throughput of the lock-based strategies increases
(the lock is held for less time), but the ranking between strategies does not change.

**H7 (decision rule, stated in advance).** ADR 0002 is **confirmed** if, in shapes H and M, `nokey` reaches at least 90%
of the best alternative's goodput with p99 latency no worse than twice the best, and in shape W it is within noise of
every alternative, and it is the only one that keeps credits unblocked without retries. It is **superseded** if an
alternative beats it by more than 10% goodput at 16 clients in shapes H or M without failing the correctness bar.

## Method notes

- Lock-wait share uses two views: client-side lock-acquire latency and the sampled count of waiting backends.
  PostgreSQL's own lock-wait accounting is not available without `log_lock_waits` parsing, which would perturb timings.
- Machine, CPU count, RAM and PostgreSQL version are recorded in the results. The machine is a laptop with a desktop
  session; background load (browser) is recorded, cannot be removed, and is why only same-session ratios are compared.
- Retry loops are bounded (50 attempts) and exhaustion is counted as a failure of the strategy, not hidden.
- Experiment code lives in `bench/exp/strategies/` only. The production Settlement is not modified.
- Advisory lock key: `hashtextextended(account_id::text, 0)` gives a 64-bit key. Collisions between two Accounts only
  cause false sharing (extra waiting), never incorrectness, and at 1,000 Wallets the birthday probability is about
  `1000^2 / 2^65`, negligible. The real hazards are elsewhere: the key namespace is shared with every other advisory
  user in the database, and the lock protects only code that asks for it (a script or migration writing entries
  directly is not excluded, unlike a row lock).
