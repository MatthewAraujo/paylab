# T14 Summary

## Status

Done. ADR 0002 is **confirmed** by ADR 0010; nothing superseded.

## What Changed

- Experiment harness in `bench/exp/strategies/`: five strategy implementations on a plain `pg` connection, the T10
  scenarios as a correctness bar, a closed-loop load driver, a matrix runner and a summarizer.
- Hypotheses written and hashed first (sha256 `265b4fd0...ddea`, 2026-09-23T20:18Z), then results in
  `docs/experiments/T14-results.md` with raw JSONL and tables under `docs/experiments/raw/`.
- ADR 0010; one line under Status in ADR 0002 pointing to it.
- No production code changed; `dist/` contains nothing from `bench/` (scanned after `pnpm build`).

## Files Changed

`bench/exp/strategies/{strategies,db,correctness,load}.ts`, `run-matrix.sh`, `summarize.py`;
`docs/experiments/T14-concurrency-strategies.md`, `T14-results.md`, `raw/T14-*`;
`docs/adr/0010-confirm-source-wallet-row-lock-after-strategy-comparison.md`; `docs/adr/0002-...md` (status note);
`docs/task-runs/T14-CONTEXT.md`, `T14-summary.md`.

## Tests Added or Updated

None in the suites (experiment task). Correctness bar run per strategy: nokey, serializable, optimistic and advisory
pass; `forupdate` fails S3 with 3,413 deadlocks (a liveness failure; the ledger stayed correct).

## Commands Run

`bench/exp/reset.sh adopted`; `correctness.ts`; `run-matrix.sh` (v1, discarded, then v2, 240 runs);
`summarize.py`; `pnpm typecheck`, `pnpm lint`, `pnpm build` (dist scan), `pnpm test`, `test:integration`,
`test:e2e`, `test:concurrency`, `pnpm bench:validate`.

## Validation Result

typecheck and lint clean; unit 99, integration 70, e2e 71, concurrency 15 all pass (tests ran after the last
measurement); bench database restored to `adopted` and `bench:validate` OK.

## Decisions Made

ADR 0010: keep `FOR NO KEY UPDATE`. Key numbers (16 clients, hot Wallet, `synchronous_commit=off`): nokey 101 tps,
advisory 104, forupdate 99, optimistic 48, serializable 32. Wide shape at 64 clients: nokey 2,576, serializable 165.
Credit p50 while the hot Wallet is debited: 1.3 ms (nokey, advisory) vs 91 ms (`FOR UPDATE`). Why v1 was discarded:
rotation aliasing (same strategy first in every repetition, cold buffers) and bimodal fsync noise; v2 used a Latin
square rotation, both commit modes per cell and 10 s windows (documented in T14-results.md).

## Follow-up Needed

- `FOR UPDATE` deadlocks crossed transfers: the weaker lock mode is load-bearing; worth a comment in the settlement adapter.
- SSI false positives came from predicate-lock promotion; `max_pred_locks_*` tuning was not tested.
- Credit aborts were not counted separately from debit retries (H5 last clause untested).
- Hot-Wallet ceiling (about 100 per second) follows the Balance read; ADR 0009 triggers stand.

## Context for Next Task

None (T14 is the last task). Parent adds the benchmark pointer to PROJECT.md.
