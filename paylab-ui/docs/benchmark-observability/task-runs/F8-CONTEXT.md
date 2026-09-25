# F8 Context

## Task

Artifact viewer: read sanitized Benchmark Artifacts in the browser as plain text, in bounded chunks, with wrap control, copy, download, and honest loading, error, and missing-file states. Delivered as a self-contained component (`ArtifactViewerDialog`) plus a generic local dialog primitive. Wiring into the Run detail inventory (F7) and the active-Run panel (F6) is done later by the orchestrator. Spec: `../tasks/F8.md`.

## Related PRD Acceptance Criteria

US-52 (open as plain text), US-53 (bounded chunks, deliberate "load more"), US-54 (wrap toggle), US-55 (copy loaded text, download the complete file), US-56 (strictly escaped text), US-57 (loading, fetch error, missing file inside the viewer), US-58 (retained-locally note); log links of US-28 and US-50 via the exported trigger.

## Relevant Prior Summaries

- F2: `fetchArtifact`, `fetchArtifactContent(runId, artifactId, {offset, limit})`, `artifactDownloadUrl`, failure taxonomy (`artifact-unavailable`, `not-found`, `unavailable`, `unreachable`), `unwrap`, `benchmarkKeys`, typed fixtures, `createBenchmarkApiStub`.
- F4: `BenchmarkLoading`, `BenchmarkUnreachable`, `BenchmarkUnavailable`, `Button`, `CopyableId` copy pattern.

## Files Likely Affected

New only: `src/components/ui/dialog.tsx` (generic Radix dialog), `src/features/benchmarks/artifacts/{use-artifact-text.ts,artifact-viewer.tsx,artifact-viewer-dialog.tsx}` and their tests. No existing file is edited.

## Test-First Plan

Component tests with the request stub and a real `QueryClientProvider`:

- the first chunk loads;
- "Load more" requests the next offset until `nextOffset` is null;
- markup in content renders as literal text;
- wrap toggles;
- copy puts the loaded text on the clipboard with polite feedback, and a failure message;
- download is a link to the API download route;
- retained-locally note;
- states: loading, fetch error with retry, listed-but-unavailable file, unknown Artifact, capability off;
- keyboard: focus enters the dialog, Escape restores focus to the trigger.

## Constraints

Shared code is imported read-only. Text only, never HTML, no syntax highlighting. 64 KiB default chunk (API maximum 256 KiB). `TASKS.md` is not edited. English copy, canonical terms, `text-xs` baseline.

## Risks

The viewer must never assume the whole file is loaded (chunks are whole lines, `nextOffset` drives paging). Clipboard availability varies, so failure gets a message.

## Definition of Done

Any listed Artifact can be inspected, copied, and downloaded safely, and every failure mode is explained where it occurs. `pnpm lint`, `typecheck`, `test` and `build` exit 0. One atomic commit.
