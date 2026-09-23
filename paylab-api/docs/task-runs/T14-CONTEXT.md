# T14 Context

## Task

Experiments: concurrency strategy comparison. Compare the ADR 0002 baseline (`FOR NO KEY UPDATE`) with
`SERIALIZABLE` plus retry, optimistic versioning and advisory locks, with `FOR UPDATE` as a control, under
contention on the T12 benchmark dataset. Confirm or supersede ADR 0002 with an ADR.

## Related PRD Acceptance Criteria

US-52 and US-79 (concurrency safety; strategy comparison).

## Relevant Prior Summaries

T10 (scenarios reused as the correctness bar, lock-observation helpers), T12 (dataset, `bench/`), T13 (adopted
schema, `bench/exp/reset.sh`, ADRs 0005 to 0009, the Balance read as lock hold time).

## Files Likely Affected

`bench/exp/strategies/` (experiment code only), `docs/experiments/` (hypotheses, results, raw), `docs/adr/0010`,
one Status line in ADR 0002. No `src/` change.

## Test-First Plan

Hypotheses and load shapes written and hashed before any measurement; the correctness bar (T10 scenarios plus the
global invariant check) runs per strategy before any timing.

## Constraints

Experiment code out of the production build; machine otherwise idle during measurement, tests only afterwards;
no PROJECT.md or TASKS.md edits; the version column exists only in the scratch benchmark database.

## Risks

Laptop timing drift and fsync noise (compare within a session, primary comparison with `synchronous_commit=off`);
retry-loop design affects the abort-based strategies (bounded 50 attempts, small jitter, identical for both).

## Definition of Done

Comparison document with measurements, ADR 0010 confirming or superseding ADR 0002, no experiment code in `dist/`,
all test layers green, bench database restored to the adopted state.
