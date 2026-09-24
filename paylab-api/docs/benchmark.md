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
Reset by running `pnpm bench:seed` again (it empties the benchmark database first); `pnpm benchmark:run` restores it from the template instead (see below); remove the
container and data with `docker compose down && rm -rf data/pg-bench`.

The runner refuses any database whose name does not contain `bench`, because seeding empties
the database it connects to. The benchmark database never shares a container, port, volume or
environment variable with development (`DATABASE_URL`, port 5432) or tests (Testcontainers).

## Publishing benchmark Runs

The dataset above feeds an explicit, manual workflow that runs the **complete** Benchmark Suite (the T13 read scenarios, then the T14 correctness gate and concurrency matrix) from a clean commit and publishes the result. It is never started by a page visit, a push, a schedule, or CI, and the console cannot start it.

### One-time setup

```bash
pnpm bench:up && pnpm bench:migrate && pnpm bench:seed   # the full dataset (see Quick start)
pnpm bench:template                                      # freeze it as the pristine copy every Run restores from
pnpm benchmark:import                                    # import the T13 and T14 evidence as history (idempotent)
```

`bench:template` validates the dataset first and records its digest on the template. To reuse a template that already exists (for example `paylab_bench_adopted` from the T13 work) set `BENCH_TEMPLATE_DATABASE=paylab_bench_adopted`; a hand-made template has no recorded digest, so the drift check is skipped for it. `benchmark:import` writes three Summaries to `bench/results/` (`imported-t13-step1-baseline`, `imported-t13-step2-adopted`, `imported-t14-load-v2`) from the files under `docs/experiments/`; commit them.

### Running

```bash
pnpm benchmark:run --note "after the payments index change"
```

Requirements: a clean Git worktree (tracked and untracked changes both count; `.benchmark/` is ignored), the benchmark PostgreSQL container running, an existing template, and no other Run in progress (a second invocation reports the active Run and its stage). The command checks these before it opens a Run, so an unprepared machine publishes nothing.

What it does to your machine, in order: it **drops and recreates `paylab_bench` from the template** and applies pending migrations (once at the start, and once per repetition inside every T14 cell), validates the dataset and the ledger invariants, runs the T13 read scenarios (1 warm-up and 7 measured executions each, median), then the T14 correctness gate and the matrix (2 s warm-up, 10 s window, 3 repetitions, Latin-square strategy order). Expect roughly two hours end to end: the correctness gate alone took about 16 minutes in the original experiment and the matrix about 75. Use an otherwise idle machine; timings drift between sessions, so compare Runs from the same environment.

Progress is written continuously: while it runs, `.benchmark/runs/<runId>/state.json` holds the `RUNNING` record and each scenario log grows under `artifacts/`. Ctrl+C stops the running scenario and publishes an `INCOMPLETE` Run; a killed process is recovered as `INCOMPLETE` by the next invocation.

### After a Run

The command lists the generated files and a suggested commit message, and **commits nothing**. Review `bench/results/<runId>.json`, then commit it. Until every generated change (a Summary, a Baseline selection) is committed or discarded, the next `benchmark:run` refuses to start. A failed or interrupted Run is published as `INCOMPLETE`: it keeps the completed measurements and the failure evidence, is excluded from comparisons, and cannot become the Baseline. A failed preparation step (PostgreSQL down, missing template, invariant violation) names its step and how to fix it.

### Where things live

| What | Where | In Git |
| --- | --- | --- |
| Run Summaries (small, normalized, deterministic JSON) | `bench/results/<runId>.json` | yes, committed by hand |
| The Baseline pointer | `bench/baseline.json` | yes, committed by hand |
| Logs, query plans, raw samples, the running state | `.benchmark/runs/<runId>/` (`BENCH_ARTIFACT_ROOT`) | no, kept without expiry |
| Evidence of Imported Runs | `docs/experiments/` (referenced in place) | yes |

Logs and plans are sanitized (database URLs, credentials, configured secrets) before they are stored and again before the API serves them.

### Reading the evidence

The API serves it under `/v1/benchmarks` (all `GET` except the Baseline selection): `status`, `runs`, `runs/:runId`, `runs/:runId/progress`, `runs/:runId/artifacts/:artifactId` (with `/content` and `/download`), `comparisons/default`, `comparisons`, `trends`, and `baseline`. It is a local developer surface: on by default only with `NODE_ENV=development` (`BENCHMARK_ENABLED` overrides it outside production), the API refuses to start with it enabled in production, every route answers 404 when it is off, and it needs neither a Merchant API key nor the benchmark database. It reads only these files; clients never send a path.

- **Comparisons** are per scenario. A scenario is *comparable* only when its definition, the dataset, and the environment match; otherwise it is labelled `new`, `removed`, `changed`, `environment-incompatible`, or `dataset-incompatible` and no delta is computed. A change within 5% is *stable*, a presentation tolerance and not statistical significance. By default the newest completed Run is compared with the previous compatible one.
- **The Baseline** is one deliberately chosen completed Run. `PUT /v1/benchmarks/baseline` with `{ "runId": "..." }` writes only the small pointer file and reports the pending Git change; commit it like any other generated change.

### Known limitations

- A full T14 Summary is large (about 555 KB) because label, unit, and direction repeat for every strategy in every cell; versioning many Runs grows the repository. A compact form is an open decision.
- Imported and native scenarios never share a definition, so native-versus-imported shows `changed`; an imported Run's environment facts are quoted from documents, so a native Run on the same machine may show `environment-incompatible` until a native reference exists.
- Only the executor's own preflight guards the database: never point `BENCH_DATABASE_URL` at data you care about (the name must contain `bench`, the host must be local, and it must differ from `DATABASE_URL`).

### First full Run: manual validation checklist

Automated tests cover the executor, the gates, the API, and a reduced end-to-end Run on a small dataset. The exact production protocol is validated by hand once:

1. Confirm the checklist above (clean worktree, container up, template exists).
2. `pnpm benchmark:run --note "first native full run"`; watch `.benchmark/runs/<runId>/state.json` and `GET /v1/benchmarks/runs/<runId>/progress` update.
3. When it finishes, check the printed report, that `bench/results/<runId>.json` is `COMPLETED`, that no secret or URL with credentials appears in the logs, that `git status` shows only the Summary, and that `.benchmark/` stays out of Git.
4. Compare it with the imported Runs (`GET /v1/benchmarks/comparisons?current=<runId>&reference=imported-t14-load-v2`) and expect honest `changed` / `environment-incompatible` states, not deltas.
5. Commit the Summary, then select a Baseline if wanted and commit `bench/baseline.json`.

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
