# F2 summary: benchmark API client, hooks and test support

Lane A, branch `worktree-agent-a1e4a3f7a4e9a98bb`.

## Gates

| Gate | Exit code |
| --- | --- |
| `pnpm lint` | 0 |
| `pnpm typecheck` | 0 |
| `pnpm test` | 0 (143 tests) |
| `pnpm build` | 0 |

## Public API (all under `src/features/benchmarks/api/`)

- `results.ts`: `BenchmarkFailure` (kinds `unavailable`, `unreachable`, `malformed`, `not-found`,
  `artifact-unavailable`, `refused`, `http`), `BenchmarkResult<T>`, `BenchmarkRequestError`
  (has `.failure`), `describeFailure(failure)`, `unwrap(result)`.
- `benchmark-api.ts`: `fetchBenchmarkStatus`, `fetchRuns(params, options)`, `fetchRun(runId)`,
  `fetchRunProgress(runId)`, `fetchArtifact(runId, artifactId)`,
  `fetchArtifactContent(runId, artifactId, {offset, limit})`, `artifactDownloadUrl(runId,
  artifactId, baseUrl?)`, `fetchDefaultComparison`, `fetchComparison({current, reference})`,
  `fetchTrend({scenarioId, metric, dimensions?})`, `fetchBaseline`, `selectBaseline(runId)`. All
  return `Promise<BenchmarkResult<T>>`; the last argument is `CallOptions {signal?, baseUrl?}`.
  Exported types: `BenchmarkStatus`, `RunPage`, `RunDetail`, `RunProgress`, `ArtifactMetadata`,
  `ArtifactChunk`, `Comparison`, `Trend`, `BaselineView`, `BaselineSelection`, `RunStatus`.
- `policy.ts`: `PROGRESS_POLL_MS` (3000), `shouldRetry(failureCount, error)`,
  `progressRefetchInterval(progress, intervalMs?)`.
- `query-keys.ts`: `benchmarkKeys` (all keys include the API base URL).
- `hooks.ts` (`"use client"`): `useBenchmarkStatus`, `useRuns(params, opts)` (infinite, by
  `nextCursor`), `useRun(runId)`, `useRunProgress(runId, {pollMs?})`, `useArtifact`,
  `useArtifactContent(runId, artifactId, range, {enabled?})`, `useDefaultComparison`,
  `useComparison(current?, reference?)` (idle until both are set), `useTrend(params, {enabled?})`,
  `useBaseline`, `useSelectBaseline()` (mutation; refreshes Baseline, default comparison and
  trends). Every hook takes an optional `{ baseUrl }`. A failed read throws
  `BenchmarkRequestError`, so a failed refresh keeps the previous data.

## Test support (`src/test/`)

- `benchmark-api-stub.ts`: `createBenchmarkApiStub()` returns `{requests, unmatched, on(method,
  path, responder), fetch, install()}`; helpers `json(body, status?)`, `networkFailure(message?)`.
  Unmatched requests answer 501 and are listed in `stub.unmatched`.
- `benchmark-fixtures.ts`: typed builders taking `Partial` overrides: `metric`, `scenario`,
  `gitState`, `runListItem`, `runDetail`, `runProgress`, `runPage`, `comparison`, `trend`,
  `baselineView`, `baselineSelection`, `artifact`, `artifactContent`, `benchmarkStatus`,
  `notFoundBody(code)`, `capabilityOffBody()`, `validationBody(code, message?)`.

## Decisions and follow-ups

- The client carries no credential and reads browser-direct (System Health precedent).
- Retry once only for unreachable or HTTP 5xx; everything else is shown at once.
- Progress polling stops on terminal states and on `abandoned` RUNNING records.
- Follow-up: F5+ should mount one `QueryClientProvider` (the console shell already has one for
  System Health) and use these hooks rather than calling `fetch*` directly.
