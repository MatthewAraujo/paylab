# Confirm the source-Wallet row lock (`FOR NO KEY UPDATE`) after comparing four alternatives

Status: accepted (confirms [ADR 0002](0002-exclusive-source-lock-for-balance-consumers.md); nothing is superseded)

**Problem.** ADR 0002 chose a pessimistic `FOR NO KEY UPDATE` row lock on the source Wallet and left `SERIALIZABLE`
with retry, optimistic versioning and advisory locks as alternatives to measure. Does any of them beat the baseline
enough to replace it, and does the stronger `FOR UPDATE` mode matter beyond blocking credits?

**Measurement** ([results](../experiments/T14-results.md); hypotheses hashed before measuring, correctness bar first,
Settlement-shaped SQL on the T12 dataset in the ADR 0005 to 0007 schema, 3 repetitions, medians, same machine and
session per comparison, `synchronous_commit=off` as the primary comparison). All five strategies were first run through
the T10 scenarios on the benchmark database.
- **Correctness.** `nokey`, `advisory`, `serializable` and `optimistic` keep the ledger balanced and Balances
  non-negative. `FOR UPDATE` **deadlocks** on crossed transfers (3,413 deadlocks in 40 rounds of A to B and B to A):
  the debit's `FOR UPDATE` conflicts with the foreign key's `FOR KEY SHARE` that the other Settlement needs on the
  destination.
- **Hot Wallet, debits only (16 clients).** `nokey` 101 Settlements/s, `advisory` 104, `forupdate` 99, `optimistic`
  48 (14 attempts per success, 40 exhausted in 10 s), `serializable` 32 (14 attempts, 39 exhausted). Locking
  strategies are flat in the client count and their latency is the queue (p50 about `clients x 9.8 ms`).
- **No contention (1,000 Wallets, 64 clients).** `nokey` 2,576/s, `advisory` 2,643, `forupdate` 2,616, `optimistic`
  2,454 (about 5% lower), `serializable` **165** (94% lower, 23 thousand serialization failures without any logical
  conflict, from predicate locks promoted to page and relation granularity).
- **Credits into the hot Wallet while it is debited (16 clients).** Credit p50: `nokey` 1.3 ms, `advisory` 1.3 ms,
  `optimistic` 3.5 ms, `serializable` 3.5 ms, `forupdate` 91 ms (363 ms at 64 clients).

**Alternatives.**
- (a) `FOR NO KEY UPDATE`, `READ COMMITTED` (baseline, chosen).
- (b) `FOR UPDATE`: same throughput, but blocks credits (70x to 280x their latency) and deadlocks crossed transfers.
- (c) `SERIALIZABLE` with retry: correct but 3x to 20x lower goodput, thousands of retries, requests that exhaust their
  retries, and false-positive aborts on unrelated Wallets; needs a retry loop around the whole use case.
- (d) Optimistic version column: correct, 2x lower goodput on a hot Wallet (all losers redo the 10 ms Balance read), a
  new column and a write on every debit; no advantage without contention (about 5% slower).
- (e) `pg_advisory_xact_lock` per Account: performance equal to the baseline within noise, credits unblocked, but it
  protects only code that takes the lock, shares a database-wide key namespace, and offers no gain to pay for that.

**Choice.** Keep ADR 0002 unchanged: `SELECT ... FOR NO KEY UPDATE` on the source Wallet of Balance Consumers, in
`READ COMMITTED`, Balance computed under the lock. `advisory` ties on measured performance, so the tie is broken by
what the alternatives cost: a row lock is enforced by the database for every writer that touches the row's dependents
and needs no key convention, while an advisory lock is a cooperation protocol.

**Guarantee.** No overspend, no deadlock between crossed transfers, credits never blocked, unchanged from ADR 0002. The
T14 evidence adds that the no-deadlock guarantee depends on using the weaker lock mode: with `FOR UPDATE` a crossed
pair of transfers forms a lock cycle through the destination's `FOR KEY SHARE`. The lock mode is therefore not a
performance detail and must not be strengthened.

**Cost.** Debits on one Wallet are serialized: about 100 per second for the hottest Wallet of the benchmark dataset
(hold time about 10 ms, the Balance read), with latency equal to queue length times hold time and lock wait being 94%
to 98% of a debit's latency at 16 and 64 clients. That ceiling falls as the Wallet's entry count grows; ADR 0009 sets
the revisit triggers (a materialized Balance) and this comparison does not change them. Lock strategies get worse if
transactions are lengthened while the lock is held. Measurements are from one laptop; only ratios are portable.

Experiment code (alternative settlements, load driver, correctness harness) lives in `bench/exp/strategies/` and is not
part of the production build.
