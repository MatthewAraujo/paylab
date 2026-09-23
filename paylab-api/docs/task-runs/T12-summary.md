# T12 Summary

## Status

done

## What Changed

- `bench/`: SQL generator (`bench/sql/00..06`), `bench/lib/seed.ts` (runner), `bench/lib/stats.ts` (statistics and checks), `bench/run.ts` (CLI: `migrate`, `seed`, `validate`, `targets`, `explain`).
- Separate benchmark database: compose service `postgres-bench` (port 5433, own volume `data/pg-bench`, `paylab_bench`), `BENCH_DATABASE_URL` in `.env.example`; the CLI refuses a database whose name lacks "bench".
- Dataset generated inside PostgreSQL with hash-derived pseudo-randomness and ids (deterministic), skew via a hot class (top 1% of Wallets) receiving half of the Payment endpoints, one funding Payment per Wallet sized to its total outflow so no Wallet is ever overdrawn, balanced Ledger Transactions inserted in 50k-Payment batches through the real deferred triggers, then `VACUUM (ANALYZE)`.
- Plan capture: `pnpm bench:explain -- <file.sql> [params]` (PREPARE plus `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`, custom plans), and `pnpm bench:targets` for hot, median and cold Wallets and Merchants.
- `docs/benchmark.md`: reproducible guide with machine, PostgreSQL version and results.
- `tsconfig.json` typechecks `bench/`; `tsconfig.build.json` still includes only `src/`, verified: `dist/` has no `bench`.

## Files Changed

bench/sql/00-functions.sql, 01-reset.sql, 02-reference.sql, 03-plan.sql, 04-funding.sql, 05-transfers.sql, 06-finish.sql, bench/lib/seed.ts, bench/lib/stats.ts, bench/run.ts, test/integration/benchmark-dataset.spec.ts, docker-compose.yml, package.json, tsconfig.json, .env.example, docs/benchmark.md, docs/task-runs/T12-CONTEXT.md, docs/task-runs/T12-summary.md.

## Tests Added or Updated

`test/integration/benchmark-dataset.spec.ts` (5 tests, small run of 10,000 Payments and 200 Wallets, about 20 s): counts and two entries per settled Payment, global invariant helper clean and no Wallet negative at any point in time, top 1% share within 45-55%, determinism (same seed equal, other seed different), no helper objects left and no trigger disabled, `ANALYZE` done. Observed red first (module missing), then green after two generator bugs found by the run itself: `CREATE FUNCTION` on a reused pooled session, and untyped enum literals inside `UNION ALL`.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (99), `pnpm test:integration` (66), `pnpm test:e2e` (71), `pnpm build`, `pnpm bench:up`, `bench:migrate`, `bench:seed -- --small`, `bench:seed` (twice), `bench:validate` (inside seed), `bench:targets`, `bench:explain` (smoke), guard check against a non-bench database URL.

## Validation Result

Green. Full run on the benchmark database: 1,001,000 Payments, 950,988 Ledger Transactions, 1,901,976 entries (exactly 2 per settled Payment), 50 Merchants, 1,000 Wallets, top 1% share 0.4998, invariant helper clean, no Wallet ever negative. Load time 256.7 s in the runner (4 min 23 s wall), second run 253.6 s with the identical digest `f827ada9033d9ffa27971798ff908eff`. Database 729 MB. Machine: AMD Ryzen 7 5825U, 16 logical CPUs, 15 GiB RAM; PostgreSQL 16.15.

## Decisions Made

- Pseudo-randomness is a hash of (seed, key), not `random()`/`setseed()`, so results do not depend on evaluation order.
- "Top 1% of Wallets hold about half of the entries" is measured over Wallet entries (the External Clearing Account only takes the 1,000 funding entries).
- A temporary index on `ledger_entries (ledger_transaction_id)` exists only during the load (dropped before ANALYZE). Reason: the deferred balance trigger looks entries up by that column and the schema has no index for it; without it every inserted row scans the table. Integrity is not weakened.
- Statuses are assigned by the generator (95/3/1.5/0.5%), not by replaying Settlement; only SUCCEEDED Payments carry a Ledger Transaction.
- `VACUUM (ANALYZE)` instead of plain `ANALYZE`, for a current visibility map (index-only scans possible in T13).
- Server tuning of the benchmark container is limited to memory settings; durability settings stay default for T14.
- The generator needs at least 200 Wallets (so the top 1% is at least two Wallets).

## Follow-up Needed

- T13: the balance trigger's lookup by `ledger_transaction_id` runs at every real Settlement commit and has no supporting index; measure its cost as part of the write-cost experiments and decide on that index.
- The integration suite grows by about 20 s from the five small-run tests.
- The benchmark container and its volume are left running for T13 and T14 (`pnpm bench:up`).

## Context for Next Task

Start with `pnpm bench:up`, `pnpm bench:validate`, then `pnpm bench:targets` for parameters and `pnpm bench:explain` for plans; the exact SQL is in `docs/reads-sql.md`. Hot Wallet has 95,496 entries, cold 873; baseline history plan for the hot Wallet is a parallel sequential scan (about 104 ms).
