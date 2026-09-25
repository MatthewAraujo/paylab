# B6 Context

## Task

Development-only, typed, read-only HTTP API for benchmark evidence: capability/status, paginated Runs, Run detail and progress, comparison compatibility and the default pair, trends, and sanitized Artifact metadata, bounded content, and download. Spec: `../tasks/B6.md`.

## Related PRD Acceptance Criteria

US-16 (live logs), 23 (redaction), 45..47 (list, detail, Artifact access), 48..50 (default pair, compatibility), 52..53 (trends and incomplete markers), 59..63 (capability off by default outside development, honest unavailability, no route starts a Run, malformed-record isolation, no financial auth or benchmark database), 64 (OpenAPI), 65.

## Relevant Prior Summaries

`task-runs/B5-summary.md`: three imported Runs in `bench/results/`; imported Artifacts resolve through `legacyFile` (repository-relative, under `docs/experiments/`). `task-runs/B4-summary.md`: metrics match by key plus `dimensions`; `NEUTRAL` is informational. `task-runs/B2-summary.md`: local layout `.benchmark/runs/<runId>/{state.json,artifacts/<id><ext>}`, versioned Summaries `bench/results/<runId>.json`, sanitizer in `scripts/benchmark/sanitize.ts`. `task-runs/B1-summary.md`: `parseSummary`, `compareRuns`, `selectDefaultComparison`.

## Files Likely Affected

- `src/infra/env/env.ts` (capability flag and paths), `.env.example`.
- New `src/infra/benchmark/` (filesystem reader, path containment, sanitizing stream) and `src/infra/http/{benchmarks.module.ts,controllers/benchmarks.controller.ts,presenters/benchmark-*.ts,openapi/benchmark-responses.ts}`; `src/infra/app.module.ts`.
- New pure read models in `src/domain/benchmark/` (list projection, progress, trend); the sanitizer moves from `scripts/benchmark/` into `src/domain/benchmark/` because the API must re-apply it.
- Tests: pure specs, filesystem-reader specs on temporary directories, e2e specs with real Summary and Artifact fixtures, OpenAPI contract extension.

## Test-First Plan

Pure: list projection (headline metrics, counts, failure), progress, trend (compatible completed points only, incomplete markers, exclusion reasons). Filesystem: valid, malformed, and running records, containment and traversal, missing files, bounded reads. E2E: capability off (production and default) and on, list order and cursor pagination, detail and progress, imported and incomplete Runs, Artifact metadata, missing Artifact, bounded content, download, traversal rejection, redaction defense, default pair and comparison states, trends, malformed record isolation, no route that starts a Run, no benchmark database and no Merchant authentication.

## Constraints

- The surface is a local developer tool: off outside development, refused at boot if enabled in production, routes answer 404 when off. It never touches the financial repositories or authentication, and needs no benchmark database.
- Clients never supply filesystem paths: identifiers are validated, files come from the record's own Artifact references, containment is checked after resolving symlinks.
- Payloads are bounded: paginated history with light items, capped inline reads, streamed downloads.
- Follow existing conventions: zod pipes (422), `{code,message}` 404, keyset-style opaque cursor, documentation-only DTO classes for OpenAPI.
- Do not edit the PRD or task files; the real benchmark container stays untouched.

## Risks

- A full T14 Run detail is about 555 KB; acceptable locally, and the list stays light. A per-scenario filter can be added if the console needs it.
- Trend compatibility follows the newest completed Run that has the scenario; imported points therefore show up as excluded ("changed") once a native Run exists.
- Reading files per request (no cache) is fine for a local tool.

## Definition of Done

OpenAPI fully describes a safe local read API and production-mode e2e proves the surface is unavailable; `pnpm test`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green; one commit with code, tests, this file, the summary, and the index update.
