# F6 summary — Active Run: progress and recent log

Status: done. Tests first (13 panel tests with fake timers and the request stub, 7 pure log-tail tests, 1 overview integration test).

## What changed

- `src/features/benchmarks/active-run/`: `ActiveRunPanel` (`active-run-panel.tsx`), `RecentLog` (`recent-log.tsx`), pure `log-tail.ts` (`logTailRange`, `logTailLines`, `TAIL_BYTES`, `TAIL_LINES`).
- The overview (`BenchmarkOverview` → `LatestSection`) renders the panel when the latest Run is RUNNING and refetches the Run list on `onSettled`.

## Behavior

RUNNING status, counts (completed, active, pending, failed), current scenario, elapsed time at the last refresh, native `<progress>` with a text value, "Polling every N s", last successful refresh time. Polling stops for COMPLETED, INCOMPLETE and abandoned (abandoned shows an explanation instead of progress). A failed refresh keeps the last data and shows `RefreshFailedNotice`. A first-read failure shows the unreachable state with retry.

## Hand-off for wiring (orchestrator)

- Component: `ActiveRunPanel` from `@/features/benchmarks/active-run/active-run-panel`, props `{ runId: string; startedAt: string; pollMs?: number; onSettled?: () => void }`. It needs the ambient `QueryClientProvider`.
- The log tail renders in `RecentLog` (`active-run/recent-log.tsx`), inside the panel, as `<section aria-label="Recent log output">` with a `<pre>`. The F8 viewer can replace or extend that block; the panel already links to the Run detail.
- The Run detail (F7/F10) can render the same panel for a RUNNING record.

## Follow-ups

- Wiring the F8 viewer link into the panel (F10).
- The log Artifact id convention `<scenarioId>-log` is taken from the API executor; if the Run detail lists it differently, adjust `RecentLog`.

## Validation

`pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 (48 files, 316 tests), `pnpm build` 0.
