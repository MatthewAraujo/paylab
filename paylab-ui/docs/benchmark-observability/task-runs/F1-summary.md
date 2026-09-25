# F1 Summary

## Status

Done. The one open item is outside this task: the repository-wide `pnpm lint` exits 1 only because Biome also lints the untracked `PayLab-Benchmarks-source/` prototype directory (see Follow-up). Every project source file is lint-clean.

## What Changed

- The OpenAPI snapshot and generated types were refreshed from the running local API (`pnpm sync:api`). The change is strictly additive: 11 benchmark paths and 34 schemas added; no path, schema, or other top-level key that existed changed (checked structurally, not by text diff).
- `deriveCapabilities` now also derives two flags:
  - `benchmarks`: true when every Benchmarks read the console uses is described with a typed JSON response (status, runs, run detail, progress, artifact metadata, artifact content, default comparison, chosen comparison, trends, baseline).
  - `benchmarkBaselineWrite`: true only when `PUT /v1/benchmarks/baseline` is typed. Benchmarks stay usable without it.
- `capabilityNotice` is now typed by a new `FinancialCapability` (excludes `health`, `benchmarks`, `benchmarkBaselineWrite`), so the "activation pending" notice cannot be requested for them.
- The Artifact download route is deliberately not required: it is a plain link, not a typed read.

## Files Changed

- Modified: `openapi/paylab.json`, `src/api/generated/schema.d.ts`, `src/api/capabilities.ts`, `src/api/capabilities.test.ts`, `src/api/current-capabilities.ts`
- New: `src/api/current-capabilities.test.ts`, `docs/benchmark-observability/task-runs/F1-CONTEXT.md`, `docs/benchmark-observability/task-runs/F1-summary.md`

## Tests Added or Updated

Written failing first (9 failures before the change): existing exact-object expectations updated with the two new flags; new cases for typed reads, the separate typed PUT, missing routes, each read route without a JSON schema (10 routes, one at a time), and independence from the financial flags; a contract test that the snapshot documents all 11 paths, that the derived capabilities are true from it, and that the generated schema contains the paths and the key response types (`RunPageResponse`, `RunDetailResponse`, `RunProgressResponse`, `ComparisonResponse`, `TrendResponse`, `BaselineResponse`, `BaselineSelectionResponse`, `ArtifactContentResponse`), so a stale snapshot fails loudly.

## Commands Run

`pnpm exec vitest run src/api` (RED then GREEN), `pnpm sync:api` (API at `http://localhost:3333`, started by the orchestrator), a structural comparison of the old and new snapshots, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm exec biome check src tests scripts`.

## Validation Result

`pnpm typecheck` exit 0; `pnpm test` exit 0 (25 files, 94 tests); `pnpm build` exit 0; `pnpm exec biome check src tests scripts` exit 0. `pnpm lint` exit 1: all 20 diagnostics are in `PayLab-Benchmarks-source/dist/benchmarks.css` (and none anywhere else); this is not caused by F1.

## Decisions Made

- Two separate flags instead of one, so the read-only area never depends on the write.
- `benchmarks` requires all ten typed reads (all-or-nothing) so a partial contract cannot half-enable the area.
- The contract test reads the committed files, so it is a plain guard against drift, not a network call.

## Follow-up Needed

- **For the orchestrator/user**: `biome.json` excludes `PayLab-source` but not the new `PayLab-Benchmarks-source` directory, so `pnpm lint` fails on the prototype. Adding `!!PayLab-Benchmarks-source` to `files.includes` (mirroring `PayLab-source`) fixes it; that file is outside this lane's boundary, so it was not changed.
- Regenerate with `pnpm sync:api` whenever the API's benchmark contract changes.
- Incident, resolved: during validation an ad hoc `git stash push -u` on the untracked prototype directory temporarily removed it; it was restored by SHA (all 15 files, 196 K, identical listing) and the stash entry dropped. Nothing else was touched.

## Context for Next Task

Generated types now include `paths["/v1/benchmarks/..."]` and the response schemas; import them from `@/api/generated/schema`. Capability flags derived by `deriveCapabilities` / exported as `currentCapabilities`: `health`, `dashboard`, `accounts`, `payments`, `ledger`, `benchmarks`, `benchmarkBaselineWrite`. Benchmark 404s have two meanings (no `code` = capability off; `BENCHMARK_*` codes = unknown Run or Artifact); the taxonomy is F2's job.
