# B8 Summary

## Status

Done, **except one manual step that was deliberately not run**: the first native full Benchmark Run. It drops and recreates the developer's `paylab_bench` from a template, needs that template to exist, and takes about two hours, so it waits for the developer's explicit go-ahead. Everything else in B8 is validated. The UI-side gates of the original cross-project plan (Playwright smoke, OpenAPI client regeneration, console rendering) belong to the UI plan.

## What Changed

- **Operating documentation**, current and checked:
  - `PROJECT.md` (stable commands, layout, variables): the new commands (`bench:template`, `benchmark:run`, `benchmark:import`), the `bench/` tree with the versioned evidence, the local `.benchmark/` directory, the `BENCH_*` and `BENCHMARK_ENABLED` variables, and pointers to the PRD, plan, and ADR 0011.
  - `docs/benchmark.md`: a new "Publishing benchmark Runs" guide with one-time setup, running (requirements, what it destroys, order of work, expected duration, interruption and recovery), what to do after a Run, where things live and what is in Git, how to read the evidence through the API and its access rules, comparison and Baseline semantics, known limitations, and a checklist for the first full Run.
  - `docs/DEVELOPMENT.md`: a short pointer that benchmarks are a separate manual workflow, never part of the gates or CI.
  - `CONTEXT.md`: the durable decisions and known risks of the feature (clean-commit publishing, template restore and the schema state outside the fingerprint, one scenario per T14 cell with the strategy as a dimension, the gate that encodes the recorded outcome, imported Runs that never invent data, the local-only read API, size and drift risks).
- **Tests**: a documentation drift test (`test/docs/benchmark-docs.spec.ts`) and a production-mode e2e that boots the real application with the real environment resolution.

## Files Changed

- Modified: `PROJECT.md`, `CONTEXT.md`, `docs/benchmark.md`, `docs/DEVELOPMENT.md`, `docs/benchmark-observability/TASKS.md`
- New: `test/docs/benchmark-docs.spec.ts`, `test/e2e/benchmarks-production.e2e-spec.ts`, `task-runs/B8-CONTEXT.md`, `task-runs/B8-summary.md`

## Tests Added or Updated

- Documentation: every `pnpm` command mentioned in `PROJECT.md`, `docs/benchmark.md`, and `docs/DEVELOPMENT.md` exists in `package.json`; every `bench*` and `benchmark*` script is in the handbook; every `BENCH*` variable of `.env.example` (and `BENCHMARK_ENABLED`) is documented; relative links resolve; the guide states the storage layout, the commands, the capability rule, and the routes. Written failing first (three checks failed until the documentation was updated).
- Production mode: with `NODE_ENV=production` and nothing overridden, every benchmark route (and the Baseline write) answers 404; in the test environment the surface is off by default and on only when asked.
- A first attempt also asserted the boot refusal with the surface enabled in production through the application module. It made the e2e run exit non-zero (Nest's asynchronous config provider rejects with nobody awaiting it), so it was removed: that rule is covered where the validation lives, `test/infra/env/benchmark-env.spec.ts`.

## Commands Run

`pnpm exec vitest run` per slice; then every gate with its exit code recorded: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm test:concurrency`; and `pnpm benchmark:import` a further time against the real repository.

## Validation Result

Every gate exited 0: `pnpm test` (52 files, 384 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e` (18 files, 188 tests, no unhandled errors), `pnpm test:integration` (15 files, 126 tests), `pnpm test:concurrency` (4 files, 15 tests). `pnpm benchmark:import` against the real repository reported "unchanged" for all three imported Runs. The real `paylab-postgres-bench` container stayed untouched and healthy. The manual full Run was not executed (see Status).

## Decisions Made

- The first full native Run is not executed by the agent: it is destructive to the developer's benchmark database and long. The guide contains the exact procedure and a five-step verification checklist for it.
- No compaction of the versioned Summary was implemented: the imported Summaries are already published and immutable, so any change of format would conflict with them or require regenerating them. The size is documented as a known limitation with the options (one metric per line, a shared metric catalog, or headline metrics only in Git), still an open decision.
- Documentation is protected by a test rather than by convention, so a new script, variable, or broken link fails the fast gate.

## Follow-up Needed

- **Manual, needs your go-ahead**: create the template (`pnpm bench:template`, or `BENCH_TEMPLATE_DATABASE=paylab_bench_adopted`), then `pnpm benchmark:run --note "first native full run"` on an idle machine, and follow the checklist in `docs/benchmark.md`.
- **Decision**: how to keep versioned Summaries small if several full Runs will be committed.
- **UI plan**: regenerate the console client from the new OpenAPI document, implement the pages, the polling on `progress`, the Baseline confirmation, and the Playwright smoke against a configured local API.

## Context for Next Task

This was the last task of the API plan. The next work is the UI plan, which consumes `/v1/benchmarks` (see `docs/benchmark.md` and the generated OpenAPI document) and the design review in `paylab-ui/docs/BENCHMARKS-DESIGN-REVIEW.md`.
