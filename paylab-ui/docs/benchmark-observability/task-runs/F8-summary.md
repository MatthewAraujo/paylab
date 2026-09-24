# F8 Summary

Status: done.

## What changed

- `src/components/ui/dialog.tsx`: generic Radix dialog primitive (Dialog, DialogTrigger, DialogContent with built-in close button, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose, DialogPortal, DialogOverlay), modeled on `sheet.tsx`.
- `src/features/benchmarks/artifacts/use-artifact-text.ts`: `useArtifactText({ runId, artifactId, baseUrl })`, an infinite query over `fetchArtifactContent` with 64 KiB chunks (`ARTIFACT_CHUNK_BYTES`), following `nextOffset`.
- `artifact-viewer.tsx`: `ArtifactViewer`, the dialog body. Text only (a `<pre>` text node), wrap checkbox, copy loaded text (polite status, failure message), download link to the API download route, "Load more" with a loaded/total byte line and an end-of-file line, focusable scroll region.
- `artifact-viewer-dialog.tsx`: `ArtifactViewerDialog`, trigger button plus dialog. Nothing is requested until it is opened.
- `artifact-viewer-dialog.test.tsx`: 15 tests.

## States

Loading (busy status), fetch error with Retry (`BenchmarkUnreachable`), capability off (`BenchmarkUnavailable`), listed-but-missing file (`artifact-unavailable`), unknown Artifact (`not-found`), and a failed "load more" (inline alert; loaded text stays).

## Validation

lint 0, typecheck 0, test 0 (46 files, 286 tests), build 0.

## Decisions

- The viewer relies on the content route's specific 404 (`BENCHMARK_ARTIFACT_UNAVAILABLE`) instead of a separate metadata read, so the trigger needs only ids and a label.
- Download is offered only once text loads, so an unavailable file never shows a dead link.
- The retained-locally note is the dialog description (also gives the dialog its accessible description).

## Follow-ups

- Wiring into the Run detail inventory (F7/F10) and the active-Run panel (F6) belongs to the orchestrator.
- `next-env.d.ts` is rewritten by `pnpm build`; it was reverted and is not committed.
