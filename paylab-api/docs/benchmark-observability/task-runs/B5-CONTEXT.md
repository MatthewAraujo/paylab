# B5 Context

## Task

One-time, deterministic, idempotent importer that reconstructs honest Imported Benchmark Runs from the existing T13 and T14 evidence (`docs/experiments/`). Spec: `../tasks/B5.md`.

## Related PRD Acceptance Criteria

US-31..34 (separate imported Runs, clearly labeled, absent values stay absent, idempotent), US-44 (T14 counters available), US-43 (T13 latency and plan evidence), US-65.

## Relevant Prior Summaries

`task-runs/B4-summary.md`: `T14_CELLS`, `cellMetrics` (keys and `dimensions`), `T14_PROTOCOL`, `correctnessMetrics`, `T13_QUERIES` ids. `task-runs/B3-summary.md`: `T13_PROTOCOL`, dataset fingerprint is the data digest, description format. `task-runs/B1-summary.md`: `parseSummary`, `serializeSummary`, `publishSummary`.

## Files Likely Affected

- New `scripts/benchmark/import/` (parsers, manifest, builders) and `scripts/benchmark-import.ts` (`pnpm benchmark:import`); versioned output in `bench/results/`.
- Additive contract rules for imported Runs in `src/domain/benchmark/summary.ts` (finish time optional, `legacyFile` Artifact references) and a deterministic tie-break in `comparison.ts`.
- Tests: parsers on real rows, builders on the real files (pinned values, alignment with native scenario ids), importer I/O in temporary directories (idempotence, malformed source, immutability).

## Test-First Plan

Pinned literals from the sources; every legacy query label maps to an existing native scenario id; the T14 lines reproduce the published table cell; separate Run identities; imported provenance; absent values stay absent; protocol and environment metadata pinned; a second import changes nothing; a malformed source fails without partial output; the imported baseline and adopted Runs compare cell by cell.

## Constraints

- Structured raw sources only (generated tables, JSONL, correctness record); never scrape prose. Environment and dataset facts come from a curated manifest quoted from the results documents.
- Nothing is invented: unknown commit, branch, finish time, and minimum/maximum stay absent or `unknown`; the recording date stands in for the start time only where the source stores none, and says so.
- Existing plans and raw files are referenced in place, never copied. Never overwrite an existing Summary.
- No edits to the PRD or task files; the real benchmark container stays untouched (the importer needs no database).

## Risks

- Imported and native scenario fingerprints differ on purpose (an imported Run cannot claim the native definition), so native versus imported shows "changed" until a native Run is chosen as reference.
- The recording date is not the measurement date (T13 stores none).
- Baseline and adopted T13 states share a recording date; a deterministic tie-break orders them.

## Definition of Done

T13 (two schema states) and T14 appear as validated imported Summaries with traceable sources; the importer is idempotent; `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green; one commit with code, tests, this file, the summary, the generated Summaries, and the index update.
