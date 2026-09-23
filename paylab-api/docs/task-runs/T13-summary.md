# T13 Summary

## Status

Done. All measurements were taken before any test or build ran, on an otherwise idle machine.

## What Changed

- Hypotheses written and hashed first (`docs/experiments/T13-index-design.md`), then measured on the full
  benchmark database; results, scorecard and limits in `docs/experiments/T13-results.md` (plans in `plans/`, raw runs in `raw/`).
- Migration `20260923160000_read_and_settlement_indexes` with three indexes: `ledger_entries (ledger_transaction_id)`,
  `ledger_entries (account_id, created_at DESC, id DESC) INCLUDE (direction, amount)`,
  `payments (merchant_id, created_at DESC, id DESC) INCLUDE (status, amount)`.
- ADRs 0005 (ledger_transaction_id index), 0006 (covering history/Balance index), 0007 (Merchant/time index; partial
  index rejected), 0008 (keyset only, offset rejected), 0009 (no materialized Balance, with revisit triggers).
- Plan-regression integration test for all three indexes; experiment helpers in `bench/exp/` (not in the build).
- Pointers only: `docs/reads-sql.md` (Indexes bullet), `docs/benchmark.md` (indexes, reset states), `CONTEXT.md` (three facts).

## Files Changed

`prisma/migrations/20260923160000_read_and_settlement_indexes/migration.sql`; `test/integration/index-plans.spec.ts`;
`docs/experiments/**`; `docs/adr/0005..0009`; `bench/exp/*`; `docs/reads-sql.md`; `docs/benchmark.md`; `CONTEXT.md`;
`docs/task-runs/T13-*.md`. Not touched: `docs/TASKS.md`, `PROJECT.md`, `src/`.

## Tests Added or Updated

`test/integration/index-plans.spec.ts` (4 tests; fixture: the T12 generator at 40 thousand Payments). Red before the
migration (no index in any plan), green after, stable over 3 further runs.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (99), `pnpm test:integration` (70), `pnpm test:e2e` (71),
`pnpm test:concurrency` (15), `pnpm build` (no `bench` in `dist/`), `pnpm bench:migrate`, `pnpm bench:validate`
(invariants clean on the adopted database); measurement helpers under `bench/exp/`.

## Validation Result

Green. Key numbers (one session, baseline versus adopted): history page 58 ms to 0.11 ms; hot Balance 55 ms to 13 ms;
Payment list 25 to 52 ms to 0.1 to 0.2 ms; 90-day hot report 90 ms to 32 ms; Settlement commit 225 ms to 0.15 ms (linear in
the ledger without the index); a hot Wallet went from 3.5 to 83 to 95 Settlements per second.

## Decisions Made

See ADRs 0005 to 0009. Rejected: `(account_id)` alone, composite without INCLUDE, partial open-status index on Payments,
offset pagination, materialized Balance (proposal with triggers). ADR 0002 unchanged.

## Follow-up Needed

- `accountId` list filter for small Merchants: planner misestimate on the `source OR destination` predicate (22 ms versus
  1.6 ms forced); a query rewrite would change `docs/reads-sql.md`.
- The Balance SQL text is duplicated in `prisma-accounts-repository.ts` and `prisma-settlement.ts` (untouched here).
- Timings drift between sessions on this machine (unexplained); compare only within a session.
- PROJECT.md pointer to the benchmark guide and results is left for the parent at the end of wave 3.

## Context for Next Task

T14 starts from the adopted schema. The benchmark database `paylab_bench` is in that state now (`bench/exp/reset.sh adopted`
restores it from the template `paylab_bench_adopted`; `bench/exp/reset.sh baseline` gives the pre-index state). Reuse
`bench/exp/settle.pgbench`/`settle-hot.pgbench`, `pgb.sh`, `clone.sh` and `test/support/concurrency.ts`. Baseline for the
hot Wallet under the ADR 0002 lock: 95 / 73 / 83 tps at 1 / 4 / 16 clients (adopted schema, `synchronous_commit=off`).
Scratch databases `paylab_bench_baseline` and `paylab_bench_adopted` are templates; leave them.
