# F4 summary (lane C)

Done: shell and shared presentation for Benchmarks, test-first in four cycles.

## Route frames (fill these in later lanes)

- `src/app/(console)/benchmarks/layout.tsx`: renders `BenchmarksSubNav` above children.
- `benchmarks/page.tsx` (`BenchmarksOverviewPage`), `benchmarks/compare/page.tsx` (`ComparePage`),
  `benchmarks/trends/page.tsx` (`TrendsPage`), `benchmarks/runs/[runId]/page.tsx`
  (`RunPage`, `params: Promise<{ runId: string }>`). Each renders `BenchmarkFrame` with a
  `PendingView`; replace the `PendingView` with the real view.

## Exported components

All in `src/components/benchmarks/`:

- `BenchmarksSubNav()`, `TerminalNote()`, `PendingView({ name })`
- `BenchmarkFrame({ title, description, children? })`: header, terminal note, capability gate.
- `RunStatusBadge({ status: "RUNNING" | "COMPLETED" | "INCOMPLETE" })`
- `ProvenanceBadge({ kind: "native" | "imported" })`
- `ChangeBadge({ classification: "improved" | "stable" | "regressed" })`
- `CompatibilityBadge({ state })`: comparable, new, removed, changed, environment-incompatible,
  dataset-incompatible, not-recorded.
- `MetricValue({ value: string | null | undefined, unit? })`
- `CopyableId({ label, value })` and `compactId(value)` (whole up to 32 chars, else 12…8).
- `states.tsx`: `BenchmarkUnavailable()`, `BenchmarkUnreachable({ onRetry })`,
  `BenchmarkLoading({ label? })`, `BenchmarkEmpty({ title?, description? })`,
  `RefreshFailedNotice({ lastUpdated? })`, `SkippedRecordsNotice({ count })`.
- Shared: `Badge` gained variants completed, improved, running, incomplete, regressed,
  incompatible, stable, imported, new, removed, changed; `--success` token in `globals.css`.

## Decisions and follow-ups

- Nav "Benchmarks" sits between Ledger and System Health (desktop and mobile Sheet).
- `compactId` keeps Run ids whole (27 chars) so Runs sharing a date and commit never collide.
- The API flag is `BENCHMARK_ENABLED`; the unavailable copy says so.
- Follow-up: the F12 a11y pass should re-check `--success` contrast on the dark background.
