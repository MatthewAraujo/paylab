# T10 Context

## Task

Concurrency suite: prove under real parallel connections that Settlement is safe (no overspend, no deadlock, credits unblocked, one Payment per idempotency key, resumable after a crash). No production code unless a test exposes a real defect.

## Related PRD Acceptance Criteria

US-33, US-35, US-47..52.

## Relevant Prior Summaries

T6 (Settlement adapter, lock and claim), T9 (PaymentSubmitter, crash-resume flow, test helpers).

## Files Likely Affected

`test/concurrency/*.spec.ts`, `test/support/concurrency.ts`. No `src/` changes.

## Test-First Plan

Each scenario from `docs/tasks/T10.md`, on independent connection pools, with the global invariant check after every test: 50 parallel debits, randomized overspend rounds, different-Wallet settlements, crossed transfers, held-lock credit (plus FOR UPDATE control), 20 identical idempotency requests, crash then retry. Verify the suite fails with the lock removed.

## Constraints

Assertions on final state, counts and PostgreSQL lock state only; no timing bounds (other lanes load the machine). Flaky tests are defects.

## Risks

Machine load from parallel lanes; supertest closing a non-listening server under parallel requests.

## Definition of Done

Suite green for at least 10 consecutive runs; broken lock fails reproducibly; FOR UPDATE claim verified empirically.
