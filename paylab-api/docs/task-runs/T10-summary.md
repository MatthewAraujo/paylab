# T10 Summary

## Status

done. No production defect was found; `src/` is unchanged.

## What Changed

Added the concurrency suite (15 tests in 4 files, including the existing connections check) and a support module. Every test runs the global invariant check afterwards through the shared setup.

- `settlement.spec.ts`: 50 parallel debits of R$ 10 from R$ 100 (exactly 10 SUCCEEDED, 40 FAILED/INSUFFICIENT_FUNDS, Balance zero, 11 Ledger Transactions); 25 randomized rounds (random amount, funding, attempt count; expected successes are exact); 40 Settlements from 40 different Wallets with a background sampler of `pg_stat_activity` that must never see a lock waiter; crossed transfers A->B / B->A, 40 rounds of 16 parallel Payments, no deadlock, totals conserved, nothing left non-terminal; 30 debits racing 30 clearing credits on one Wallet, all credits applied and Balance exact.
- `lock-modes.spec.ts`: locks are held by open transactions and observed through `pg_stat_activity` (no timing bounds). FOR NO KEY UPDATE held: a credit commits (`lock_timeout` 5s as a safety net) and no waiter is visible. FOR UPDATE held (control): the same credit shows up as a lock waiter, has not finished, and completes only after release; with `lock_timeout` 300ms it fails with `55P03`. A second debit of the same Wallet waits, then runs. A Settlement of another Wallet completes while one Wallet is locked.
- `idempotency.spec.ts` (HTTP, real app): 10 rounds of 20 identical requests: exactly one 201, nineteen 200, one Payment, one Ledger Transaction, Balance debited once; the unaffordable variant returns one FAILED Payment and writes nothing; crash between the two transactions then 20 parallel retries (8 rounds) settle exactly once; a crash inside a parallel burst (8 rounds) still ends with one Settlement.
- `test/support/concurrency.ts`: wide Prisma pool (64 connections) so parallel Settlements really hold separate connections, Settlement stack builder, lock-waiter observers, `waitUntil`.

## Files Changed

test/concurrency/{settlement,lock-modes,idempotency}.spec.ts, test/support/concurrency.ts, docs/task-runs/T10-{CONTEXT,summary}.md.

## Tests Added or Updated

The 14 new concurrency tests above. There is no production change to drive, so the "red" evidence is the lock-removal mutation below.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test:concurrency` (13 green runs, see below), a temporary removal of the row lock (not committed).

## Validation Result

- 10 consecutive full runs of `pnpm test:concurrency`: 10/10 green (15/15 tests each), 26 to 49 s of test time per run, while other lanes ran Docker suites on the same machine. Three more green runs preceded them. No retries anywhere; the invariant check was clean after every test.
- Broken lock fails reproducibly: with `FOR NO KEY UPDATE` deleted from `prisma-settlement.ts` (file restored, not committed), 3 of 3 runs failed the 50-parallel test and the randomized-rounds test (overspend) and the "second debit waits" test (nothing to wait on). One of the three runs also failed the different-Wallets sampler test, under the mutation only; it passed in 4 isolated mutation runs and in all 13 runs of the real code, and the cause was not chased.
- Weak lock claim (ADR 0002) verified empirically: with FOR NO KEY UPDATE held, a credit commits without waiting; with FOR UPDATE held, the same credit blocks (PostgreSQL reports a Lock wait; it fails with 55P03 under a short `lock_timeout`). Note for the ADR trail: the conflicting lock is the foreign key's FOR KEY SHARE on the Account row taken by the entry insert.

## Decisions Made

- Lock state is asserted through `pg_stat_activity` and open transactions, not elapsed time, so CPU load cannot flip a test.
- The idempotency spec calls `app.listen(0)` once. Without it supertest starts a server per burst and closes it when the first request finishes, resetting the other parallel requests (`ECONNRESET`, plus a Prisma "Response from the Engine was empty" 500 on an in-flight request). Reproduced 3 of 3 before the fix and never afterwards in 13 runs. The Prisma error was seen only alongside the reset; I attribute it to the same harness cause but did not prove it, so it should be watched if it reappears.
- Prisma's default pool is `2 * CPUs + 1`, which would silently throttle the parallelism; the suite uses its own 64-connection pool.

## Follow-up Needed

- T14 can reuse `buildSettlementStack` and the lock observers as its correctness bar.
- The CI job for `pnpm test:concurrency` belongs to T15 (separate job).
- ADR 0002 is not edited here; the note above is input for T14.

## Context for Next Task

`test/support/concurrency.ts` exports `buildSettlementStack()`, `widePoolUrl()`, `lockWaiters()`, `waitUntil()`, `startLockWaitSampler()`, `balanceOf()`. The suite needs about 40 s and Docker.
