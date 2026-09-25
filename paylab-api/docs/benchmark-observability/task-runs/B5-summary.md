# B5 Summary

## Status

Done. The T13 and T14 evidence is imported as three separate, validated Imported Benchmark Runs by an idempotent command; the generated Summaries are included in the commit. No database, Docker, or benchmark run was needed, and the developer's real benchmark container was never touched.

## What Changed

- **Command**: `pnpm benchmark:import` reads the structured evidence under `docs/experiments/` and writes versioned Summaries to `bench/results/` (or `BENCH_SUMMARY_DIR`). Everything is read, validated, and compared with what is already published before any file is written, so a malformed source or a conflicting existing file leaves no partial output; a second run reports "unchanged". It never overwrites and never commits.
- **Three Runs, never combined**: `imported-t13-step1-baseline` (schema with constraint-provided indexes only), `imported-t13-step2-adopted` (after migration `20260923160000`, measured in the same session), and `imported-t14-load-v2` (the accepted matrix v2; the superseded v1 run is not imported).
- **Sources read** (`scripts/benchmark/import/sources.ts`): the tables printed by the T13 helper scripts (`final-*.txt`, `depth-*.txt`), the T14 driver JSON lines (240), and the T14 correctness record. Prose is never scraped. Each parser names the file and line it cannot read.
- **Alignment with native scenarios**: every legacy query label maps to the id the native suite registers (T13: the same 33 ids; T14: the correctness gate plus the 16 cells with the same metric keys and `dimensions`), so a native Run can later be compared where compatible. Imported scenarios carry `origin: imported` in their definition, so they never pass for the native definition.
- **Manifest** (`manifest.ts`): environment and dataset facts quoted from the results documents and `docs/benchmark.md` (Ryzen 7 5825U, 16 CPUs, 15 GiB, PostgreSQL 16.15 and its settings, Node 24.5.0 for T14; dataset digest `f827ada9033d9ffa27971798ff908eff`, 1,001,000 payments, 1,000 wallets, 50 merchants) and the times the sources record.
- **Evidence stays where it is**: each Run references the existing raw and plan files through `legacyFile` Artifact references instead of copying them.
- **Contract additions** (additive, B1 files): an imported terminal Run may omit `finishedAt`; `legacyFile` references are only valid on imported Runs and only under `docs/experiments/` without path tricks; `selectDefaultComparison` breaks start-time ties by run id.
- Small refactor: `cellTitle` in `t14-matrix.ts` shared by the native registry and the importer.

## Files Changed

- New: `scripts/benchmark/import/{sources,manifest,read,runs,importer}.ts`, `scripts/benchmark-import.ts`, `bench/results/imported-{t13-step1-baseline,t13-step2-adopted,t14-load-v2}.json`
- Modified: `package.json` (`benchmark:import`), `biome.json` (ignore the generated `bench/results`), `src/domain/benchmark/{summary,comparison}.ts`, `bench/scenarios/t14-matrix.ts`, `scripts/benchmark/suite.ts`
- New tests: `test/scripts/import/{sources,runs,importer}.spec.ts`; extended `test/domain/benchmark/{lifecycle,comparison}.spec.ts`
- Docs: `TASKS.md`, `task-runs/B5-CONTEXT.md`, `task-runs/B5-summary.md`

## Tests Added or Updated

Parsers on the real files and on damaged input (file and line reported); every recorded label maps to an existing native id; pinned values from the sources (adopted hot history first page 0.108 ms, baseline 57.742 ms, depth 50000 keyset 0.137 versus offset 77.938; T14 H, sync on, 4 clients, nokey: throughput 62.1, range 49.8 to 91.1; FOR UPDATE 3413 crossed-transfer deadlocks; correctness gate 946 s); three separate Runs with imported provenance and explicit "not recorded" notes; absent values stay absent (no minimum or maximum for T13, no credit metrics without credits, no finish time or duration); protocol and environment preserved; the baseline and adopted Runs compare comparable scenario by scenario (improved); a missing repetition, another measurement window, or a failing correctness record is refused; importer: valid files, idempotence, byte-identical output, refusal to overwrite, no partial output on a bad or missing source.

## Commands Run

`pnpm exec vitest run` per slice (RED then GREEN), `pnpm benchmark:import` twice against the real repository (second run: nothing to do), then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:integration`.

## Validation Result

`pnpm test`: 45 files, 324 tests passed. `pnpm test:integration`: 15 files, 126 tests passed. `pnpm typecheck` and `pnpm build` clean. `pnpm lint` first failed on a test style rule and on the formatting of the generated Summaries; both were fixed (the generated `bench/results` directory is now ignored by biome, since its canonical format is defined by the serializer) and lint is clean. The real `paylab-postgres-bench` container stayed untouched and healthy.

## Decisions Made

- T13 is imported as two Runs (baseline and adopted), not one: they are different schema states measured in one session, and the change between them is the very comparison the console exists to show. T13 and T14 stay separate; nothing is combined.
- The schema state (which indexes exist) is not part of the scenario fingerprint, for the same reason the dataset digest, not the schema, defines the dataset: an index change is the change under test. It is recorded in each Run's note.
- Unknowns stay unknown: commit and branch are the literal `unknown`; the finish time and duration are absent; the T13 start time is the commit date that recorded the evidence (the note says so), the T14 start is the time the matrix runner wrote when it began.
- Imported environment values are quoted exactly from the documents (for example the CPU model without "with Radeon Graphics"), so a native Run on this machine may still be reported as environment-incompatible until a native reference exists; inventing a match would be worse.
- Only T13 read timings and depth tables, and the T14 matrix and correctness record, are imported. The pgbench experiments (`hot.txt`, `scale.txt`, write cost) are a different kind of evidence and are not part of the registered suite.

## Follow-up Needed

- **Decision for you (size)**: `imported-t14-load-v2.json` is 555 KB (20 thousand lines, 1,775 metrics, because label, unit, and direction repeat for every strategy in every cell). A native Run has the same shape, so versioning several would add megabytes to Git. Options for B8: one-line-per-metric serialization (smaller diffs, modest size win), a shared metric catalog per Summary (a schema change, biggest win), or keeping only headline metrics in the versioned Summary and the rest in the local Artifact. I did not choose unilaterally.
- Native versus imported comparison shows scenarios as "changed" (different definitions) and, on this machine, possibly environment-incompatible; B6/UI should present that honestly.
- The imported Summaries are new and uncommitted-by-design in the sense of the workflow; they are committed with this task, so `benchmark:run` will not be blocked by them.

## Context for Next Task

B6 reads Summaries from `bench/results/` (three imported already there) and local state and Artifacts from `.benchmark/runs/<runId>/`. For imported Runs an Artifact resolves through `legacyFile` (repository-relative, under `docs/experiments/`, already validated by the schema) rather than the local Artifact root: serve it with containment checks. Metrics are matched by key plus `dimensions`; `NEUTRAL` is informational.
