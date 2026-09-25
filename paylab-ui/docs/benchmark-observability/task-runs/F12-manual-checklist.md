# F12 manual checklist (NOT yet verified)

Automated coverage is in `tests/e2e/benchmarks.spec.ts` (API intercepted), `src/app/globals.test.ts` (contrast, reduced motion) and the component tests. Nothing below has been checked by eye; run it against a real local API and record the result.

## Setup

1. `paylab-api`: `NODE_ENV=development pnpm dev` (or `BENCHMARK_ENABLED=true`), after `pnpm benchmark:import` so three Imported Runs exist.
2. `paylab-ui`: `.env` with `NEXT_PUBLIC_PAYLAB_API_URL=http://localhost:3333`, then `pnpm dev`. Open `http://localhost:3000/benchmarks`.
3. Do not run `benchmark:run` for this checklist.

## Real API and CORS

- [ ] Overview shows the latest Imported Run, its provenance and headline measurements.
- [ ] Comparison, Run detail and Trends load without console errors.
- [ ] Open an Artifact from Run detail (skip if the evidence file is not on this machine: the row shows a dash).
- [ ] Select a Baseline: the browser's cross-origin `PUT` succeeds (the automated test only intercepts it, so the API's real CORS preflight is still unverified). Afterwards `git status` in `paylab-api` shows `bench/baseline.json` changed; revert it with Git when done.
- [ ] Stop the API: every view shows the unreachable state with a retry; restart it and retry works.
- [ ] Start the API without `BENCHMARK_ENABLED` in production mode: views show "not available", not an error.

## Layout at 1440, 1024 and 390 px

- [ ] The active navigation label and the Benchmarks sub-navigation are not clipped.
- [ ] Metric, Artifact and comparison tables scroll inside labelled, focusable regions; the page itself does not scroll sideways.
- [ ] Long Run ids, commits, dimensions and log lines wrap or scroll inside their box.
- [ ] Secondary text is readable at every width.

## Zoom and keyboard

- [ ] At 200% zoom nothing overlaps or disappears and the dialogs fit the viewport.
- [ ] Tab reaches every control in a sensible order with a visible focus ring; Escape closes dialogs and returns focus to the opener.
- [ ] With the OS "reduce motion" setting on, loading skeletons do not pulse.
- [ ] Status and change meanings (Completed, Incomplete, Imported, Improved, Stable, Regressed) are readable without colour (try a greyscale filter).
