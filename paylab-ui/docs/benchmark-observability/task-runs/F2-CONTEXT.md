# F2 Context

## Task

Browser-side data layer for the benchmark surface: a credential-free typed client on the configured API base URL, an explicit failure taxonomy, TanStack Query hooks for every read and for the Baseline write, polling/retry policy helpers, and the typed fixtures and request-routing fetch stub every later lane's tests will use. Spec: `../tasks/F2.md`.

## Related PRD Acceptance Criteria

US-4 (capability unavailable is not a loading error), US-5 (unreachable API is reported differently), US-32 (taxonomy behind the states), US-96 (observable tests at the network boundary).

## Relevant Prior Summaries

`F1-summary.md`: the generated types contain `paths["/v1/benchmarks/..."]` and the response schemas (import from `@/api/generated/schema`); `currentCapabilities` exposes `benchmarks` and `benchmarkBaselineWrite`. API facts from the delivered read API: a 404 without an error `code` means the capability is off (guard `NotFoundException()` or the router's "Cannot GET"); 404 with `BENCHMARK_RUN_NOT_FOUND` / `BENCHMARK_ARTIFACT_NOT_FOUND` is a missing Run or Artifact; 404 with `BENCHMARK_ARTIFACT_UNAVAILABLE` is a listed Artifact whose local file is gone; 422 carries `VALIDATION_ERROR`, `BENCHMARK_RUN_NOT_COMPARABLE`, or `BENCHMARK_BASELINE_INELIGIBLE`.

## Files Likely Affected

New only: `src/features/benchmarks/api/**` (client, results, calls, query keys, hooks, policies and tests) and `src/test/benchmark-fixtures.ts`, `src/test/benchmark-api-stub.ts` (with a small test). Nothing existing is edited; `getApiBaseUrl` from `src/lib/env.ts` is reused.

## Test-First Plan

Network-boundary tests with a request-routing fetch stub: each taxonomy case (capability off, not found, artifact file unavailable, refusals with their codes, unreachable, non-JSON body, wrong shape, other HTTP errors); requests carry no `Authorization`, use the configured base URL, and send cursors, limits, offsets, status, repeated `dimension` parameters and the Baseline body exactly as given; hooks through a real `QueryClientProvider` (data, error, cursor paging, refresh failure keeps previous data, Baseline mutation refreshes the Baseline); pure tests for the retry policy and the polling interval rule.

## Constraints

- No credential ever: never `createServerApiClient`, never `PAYLAB_API_KEY`.
- Components must be able to avoid raw `fetch` entirely; failures are a discriminated taxonomy, never raw responses.
- Fixtures are typed by the generated schema so contract drift breaks compilation.
- Stay inside the lane boundary: only the paths listed above.

## Risks

- `openapi-fetch` binds `globalThis.fetch` when the client is created: resolve `fetch` lazily so `vi.stubGlobal("fetch", ...)` works after import.
- A refresh failure must not replace previous data: queries throw on failure (so TanStack keeps `data`), instead of returning a failure value.

## Definition of Done

Every benchmark route has a typed, tested function and hook returning the taxonomy; fixtures and stub exist; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0; one atomic commit.
