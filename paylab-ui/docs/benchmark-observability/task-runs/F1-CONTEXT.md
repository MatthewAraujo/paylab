# F1 Context

## Task

Refresh the committed OpenAPI snapshot and generated types so they include the API's `/v1/benchmarks/*` routes, and extend capability detection so the console derives, from the contract, whether the Benchmarks area can exist and whether the Baseline write exists. Spec: `../tasks/F1.md`.

## Related PRD Acceptance Criteria

US-4 (the area's availability comes from the contract), US-96 (observable tests).

## Relevant Prior Summaries

None (first task). Backend facts: 11 benchmark paths under `/v1/benchmarks`; `PUT /v1/benchmarks/baseline` is the only write; the Artifact download route is a plain link, not a typed JSON read.

## Files Likely Affected

`openapi/paylab.json`, `src/api/generated/schema.d.ts`, `src/api/capabilities.ts` and test, `src/api/current-capabilities.ts` and a new contract test.

## Test-First Plan

Failing capability tests first (typed reads give `benchmarks`; the typed PUT alone gives the Baseline write flag; missing routes or any read without a JSON schema keep it off; financial flags independent), plus a contract test that fails on a stale snapshot or generated schema. Then implement and refresh with `pnpm sync:api`.

## Constraints

Additive refresh only (verify no financial path or schema changed); no handwritten benchmark types; do not touch `docs/benchmark-observability/TASKS.md`, the PRD, task files, `PayLab-Benchmarks-source/`, or `paylab-api/`; the API is started and stopped by the orchestrator.

## Risks

A stale snapshot silently hides the area; the console must not depend on the write flag for read-only Benchmarks.

## Definition of Done

Snapshot and generated types include the benchmark routes; capabilities derived from the contract with tests; `typecheck`, `test`, `build` green and source lint clean; one commit.
