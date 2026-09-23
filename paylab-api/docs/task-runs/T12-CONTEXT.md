# T12 Context

## Task

Benchmark dataset and tooling: a reproducible, skewed dataset generated inside PostgreSQL, a dedicated benchmark database, and helpers to capture query plans (`docs/tasks/T12.md`). Dependencies T4 (triggers, invariant helper) and T11 (read queries) are done.

## Related PRD Acceptance Criteria

US-71..75: benchmark dataset (skewed, deterministic, generated in the database, valid against the triggers), separate benchmark database, plan capture, machine and PostgreSQL version recorded.

## Relevant Prior Summaries

- T4: deferred balance trigger and immutability triggers; `getInvariantViolations()` in `test/support/invariants.ts`; TRUNCATE is not covered by the triggers.
- T11: exact read SQL in `docs/reads-sql.md` / `src/infra/database/read-queries-sql.ts`; no indexes beyond the constraint-provided ones.
- T9: a Payment's Merchant owns the source Wallet; funding Payments (clearing to Wallet) carry the destination Wallet's Merchant.

## Files Likely Affected

`bench/` (SQL scripts, seed and stats libraries, CLI), `test/integration/benchmark-dataset.spec.ts`, `docker-compose.yml` (benchmark service), `package.json` (bench scripts), `tsconfig.json` (typecheck `bench/`), `.env.example`, `docs/benchmark.md`. Nothing under `src/`; `tsconfig.build.json` only includes `src/`, so benchmark code never reaches the production build.

## Test-First Plan

Validation spec on a small run (10k Payments, 200 Wallets): counts and 2 entries per settled Payment; global invariant helper clean and no Wallet ever negative in chronological order; top 1% of Wallets hold 45-55% of Wallet entries; same seed gives equal aggregates and another seed differs; no helper objects left and no trigger disabled. Then a full-size run (about 1M Payments) with recorded load time.

## Constraints

- No integrity weakening: no trigger disabling, everything through the schema's constraints and deferred triggers.
- Separate benchmark database with its own env variable; the CLI refuses a database whose name lacks "bench".
- Deterministic: hash-derived pseudo-randomness and ids, never `random()`.
- Scope: no schema changes, no indexes (T13's subject).

## Risks

- The deferred balance trigger looks entries up by `ledger_transaction_id`, which has no index; the load needs a temporary helper index (dropped before ANALYZE) or it scans per row.
- Load time on a laptop for the full run.
- The ~20 s added to the integration suite by the five small runs.

## Definition of Done

Small-run validations pass in `pnpm test:integration`; full run loads and validates on the benchmark database; `docs/benchmark.md` reproduces the setup from scratch and records machine, CPU count, PostgreSQL version and load time; typecheck, lint and tests green; one commit.
