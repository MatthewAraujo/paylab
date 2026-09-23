# T13 Context

## Task

Experiments: index design and pagination cost. Hypothesis first, then measure the Balance, history, Payment
list and report queries on the T12 benchmark database with `EXPLAIN (ANALYZE, BUFFERS)`; adopt indexes only on
a clear win with acceptable write cost (at most one migration); one ADR per major decision; plan-regression
test for each adopted index; materialization only as a proposal.

## Related PRD Acceptance Criteria

US-75..78 (plan capture, index experiments, keyset versus offset, Balance cost and materialization evidence).

## Relevant Prior Summaries

T11 (exact read SQL in `docs/reads-sql.md`), T12 (dataset, `docs/benchmark.md`, the `ledger_transaction_id` lookup finding), T10 (lock behavior).

## Files Likely Affected

`docs/experiments/` (hypotheses, results, plans, raw), `docs/adr/0005..`, one migration under `prisma/migrations`, `test/integration/index-plans.spec.ts`, `bench/exp/` (experiment helpers), `docs/reads-sql.md` and `docs/benchmark.md` (pointers only).

## Test-First Plan

Hypotheses written and hashed before measuring. The plan-regression spec was written first and seen red (4 failures: no such index in any plan) before the migration.

## Constraints

Machine otherwise idle during measurement; tests only after. Experiment code stays out of the production build. No query text change. No PROJECT.md or TASKS.md edits by this run.

## Risks

Timings drift between sessions on a laptop: compare only within a session. Migrations are hand-written (INCLUDE is not modelled by Prisma).

## Definition of Done

Results document with plans and timings, migration for adopted indexes with justification, ADRs for adopted and rejected decisions, tests green.
