# Benchmark guide

A reproducible, skewed dataset in a separate PostgreSQL database, plus helpers to capture
query plans. Built for the T13 (index and pagination) and T14 (concurrency strategy)
experiments; results and decisions live in their own documents and ADRs, not here.

## Quick start (from scratch)

Requires Docker and `pnpm install` already done.

```bash
cp .env.example .env            # skip if you already have one; it must contain BENCH_DATABASE_URL
pnpm bench:up                   # separate PostgreSQL 16 container "paylab-postgres-bench", port 5433
pnpm bench:migrate              # builds the schema from the migrations (triggers included)
pnpm bench:seed                 # full dataset, about 4.5 minutes (see Results); prints the validation
pnpm bench:seed -- --small      # 10k Payments, seconds; for trying things out
pnpm bench:validate             # statistics plus the global invariant check, any time
```

Connection string (default): `postgresql://paylab:paylab@localhost:5433/paylab_bench`.
Reset by running `pnpm bench:seed` again (it empties the benchmark database first); remove the
container and data with `docker compose down && rm -rf data/pg-bench`.

The runner refuses any database whose name does not contain `bench`, because seeding empties
the database it connects to. The benchmark database never shares a container, port, volume or
environment variable with development (`DATABASE_URL`, port 5432) or tests (Testcontainers).

## What gets generated

Everything is generated inside PostgreSQL by the scripts in `bench/sql/` (`generate_series`,
bulk `INSERT ... SELECT`), never through the application.

| Item | Full run | Rule |
| --- | --- | --- |
| Merchants | 50 | Wallet `n` belongs to Merchant `n % 50` |
| Wallets | 1,000 | all BRL |
| Funding Payments | 1,000 | one per Wallet, External Clearing Account to Wallet, earliest in time, sized to cover the Wallet's total outflow plus a buffer, so no Wallet is ever overdrawn at any point in time |
| Transfer Payments | 1,000,000 | Wallet to Wallet, R$ 1.00 to R$ 500.00, over 90 days from 2026-06-01 UTC; pairs of consecutive Payments share a timestamp so the `id` tie-break of keyset pagination is exercised |
| Statuses | 95% SUCCEEDED, 3% FAILED (`INSUFFICIENT_FUNDS`), 1.5% PROCESSING, 0.5% CREATED | assigned by the generator, not by replaying Settlement |
| Ledger Transactions | one per SUCCEEDED Payment | one debit on the source, one credit on the destination |

**Skew.** The top 1% of Wallets (the 10 lowest-numbered) are the "hot" class. Every Payment
endpoint (source and destination independently) lands on a hot Wallet with probability 0.5 and on
a cold one otherwise, uniformly inside each class, so the hot Wallets hold about half of all Wallet
entries (measured 0.4998 on the full run). Merchants that own a hot Wallet are therefore hot too.
Use `pnpm bench:targets` to get a hot, a median and a cold Wallet and a hot and a cold Merchant.

**Determinism.** No `random()`: pseudo-randomness is `hashtextextended(seed || key)` per row, and
ids are `md5(seed || kind || key)::uuid`. The same seed gives the same rows, ids included;
another seed gives another dataset. Default seed: `paylab-benchmark-v1` (`--seed <text>` to change).

**Integrity.** No trigger, constraint or foreign key is disabled or bypassed. Balanced Ledger
Transactions are inserted in batches of 50,000 Payments per database transaction, so the deferred
triggers of ADR 0003 check every transaction at commit. Afterwards `bench:seed` runs
`VACUUM (ANALYZE)` (the required `ANALYZE`, plus a fresh visibility map so index-only scans are
possible) and then `bench:validate`.

**Load-time helper index.** The deferred balance trigger looks up a transaction's entries by
`ledger_transaction_id`, and the schema has no index for that lookup. The loader creates
`bench_load_entries_by_transaction` before loading and drops it before `ANALYZE`, so the dataset
starts from the schema's own indexes only (primary keys and the unique constraints). Note for
T13: the same lookup runs at every real Settlement commit, so its cost grows with the entries table.

## Indexes present after loading

The loader itself only ever gets the indexes the migrations give. Until T13 that was the schema's own
(primary keys, `payments_ledger_transaction_id_key`, `payments_merchant_id_idempotency_key_key`,
`merchant_api_keys_key_hash_key`, `accounts_one_clearing_per_currency`). Migration
`20260923160000_read_and_settlement_indexes` (T13, ADRs 0005 to 0007) adds
`ledger_entries_ledger_transaction_id_idx`, `ledger_entries_account_created_id_idx` and
`payments_merchant_created_id_idx`, so a `bench:seed` run from a fully migrated database loads with them in place
(slower than the 4.5 minutes recorded below, which was measured before the migration). The full dataset in the
existing benchmark database was loaded before that migration and had it applied afterwards with `bench:migrate`.

### Known schema states (T13, T14)

Two snapshots of the full dataset live in the same PostgreSQL container as template databases (they are in the
Docker volume, not in the repository). Restore one into `paylab_bench` in seconds:

```bash
bench/exp/reset.sh adopted    # after migration 20260923160000 (the state T14 starts from)
bench/exp/reset.sh baseline   # constraint-provided indexes only (the state T12 loaded)
```

If the templates are gone (a fresh volume), rebuild: `pnpm bench:up && pnpm bench:migrate && pnpm bench:seed`
gives the adopted state directly. The experiment helpers (`bench/exp/`, plan timing, pgbench workloads) and the results are
described in [experiments/T13-results.md](experiments/T13-results.md).

## Validation

`pnpm bench:validate` prints the statistics and fails on any of: the global invariant helper
(`test/support/invariants.ts`, the one every database test runs) reporting a violation; entries
not equal to twice the SUCCEEDED Payments; any Wallet whose running Balance ever went negative in
chronological order; leftover helper objects; any disabled trigger.

The same checks run on a small run (10,000 Payments) in `pnpm test:integration`
(`test/integration/benchmark-dataset.spec.ts`): counts and the two-entries ratio, invariants,
skew between 45% and 55%, determinism (same seed equal, other seed different), clean schema.

## Capturing plans

`pnpm bench:explain -- <file.sql> [param ...]` prepares the SQL in the file (with `$1`, `$2`
placeholders and casts, exactly as in [reads-sql.md](reads-sql.md)) and runs it under
`EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` with `plan_cache_mode = force_custom_plan`, so the planner
sees the real values. Parameters are passed as text in order.

```bash
pnpm bench:targets                                  # pick a Wallet and a Merchant
cat > /tmp/history.sql <<'SQL'
SELECT id, ledger_transaction_id, direction, amount, created_at
FROM ledger_entries WHERE account_id = $1::uuid
ORDER BY created_at DESC, id DESC LIMIT $2
SQL
pnpm bench:explain -- /tmp/history.sql <hot-wallet-id> 21 > plan-history-hot-baseline.txt
```

Take timings on an otherwise idle machine and run each query several times (the first run
warms the cache). Compare plans and timings only within one machine and one PostgreSQL version.

## Results and environment

Recorded by `pnpm bench:seed` (the header it prints is the record to paste next to any result).

| | |
| --- | --- |
| Machine | AMD Ryzen 7 5825U, 16 logical CPUs, 15 GiB RAM, Linux 7.0 |
| PostgreSQL | 16.15 (postgres:16-alpine, Docker), `shared_buffers=1GB`, `work_mem=32MB`, `effective_cache_size=3GB`, `max_wal_size=4GB`, `synchronous_commit=on`, `random_page_cost=4` |
| Node | 24.5.0 |

Full run, seed `paylab-benchmark-v1`:

| Measure | Value |
| --- | --- |
| Payments | 1,001,000 (950,988 SUCCEEDED, 30,024 FAILED, 14,999 PROCESSING, 4,989 CREATED) |
| Ledger Transactions / entries | 950,988 / 1,901,976 (exactly two per settled Payment) |
| Top 1% of Wallets, share of Wallet entries | 0.4998 |
| Hot Wallet / median / cold Wallet entries | 95,496 / 961 / 873 |
| Hot Merchant / cold Merchant Payments | 60,209 / 9,884 |
| Load time | 256.7 s in the runner (plan 11.7 s, funding 0.4 s, transfers 243.9 s, vacuum and analyze 0.6 s); 4 min 23 s wall clock including start-up and validation; a second run took 253.6 s |
| Determinism | two full runs gave the identical aggregate digest `f827ada9033d9ffa27971798ff908eff` |
| Size | database 729 MB: `ledger_entries` 258 MB (heap 183 MB, primary key 74 MB), `payments` 379 MB with its three indexes, `ledger_transactions` 84 MB |
| Baseline plan | history of the hot Wallet, first page of 21: parallel sequential scan of `ledger_entries` with top-N sort, 104 ms (cached), the starting point of T13 (see its results for the fix) |

The small run takes about 5 s.
