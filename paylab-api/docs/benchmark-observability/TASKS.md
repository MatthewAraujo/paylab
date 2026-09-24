# Tasks — Benchmark Observability (API)

## Source Context

- PRD: [PRD.md](PRD.md). Acceptance criteria are its numbered user stories, referenced as `US-n`.
- Project handbook and glossary: `../../PROJECT.md`, `../../CONTEXT.md`.
- Storage and exposure decision: [ADR 0011](../adr/0011-version-benchmark-summaries-and-retain-artifacts-locally.md). Related: [ADR 0010](../adr/0010-confirm-source-wallet-row-lock-after-strategy-comparison.md).
- Existing benchmark guide and evidence: `../benchmark.md`, `../experiments/` (T13/T14 documents, `raw/`, `plans/`).
- Existing implementation: `bench/run.ts`, `bench/lib/`, `bench/exp/`, `bench/exp/strategies/`.
- Existing seams: `src/infra/env/env.ts`, `src/infra/app.factory.ts`, `src/infra/http/` (controllers, openapi, pagination), `test/e2e/`, `test/integration/`, `test/scripts/`, `test/support/`.
- The September plan (T1–T18) is complete and lives in `../TASKS.md`. Task IDs here use the `B` prefix to avoid collision.
- Cross-project draft and the UI consumer: `../../../docs/`, `../../../paylab-ui/docs/`.

## Implementation Goal

Deliver the API side of local benchmark observability: a terminal-only command that runs the complete Benchmark Suite from a clean revision and publishes immutable normalized Summaries plus locally retained sanitized Artifacts, imported T13/T14 history, and a development-only typed HTTP API for Runs, progress, Artifacts, comparison compatibility, trends, and Baseline selection.

## Non-Goals

- Any `paylab-ui` work (planned separately against the OpenAPI contract).
- Scheduled, CI, remote, push-triggered, or HTTP-triggered execution; partial suites; single-scenario canonical runs.
- Dirty-worktree runs, automatic commits, automatic Artifact expiry, large logs or plans in Git.
- Production exposure of any benchmark endpoint or Baseline write.
- Comparing incomplete, changed, or environment-incompatible measurements.
- Significance modeling, alerts, budgets, SLOs, WebSockets, or third-party benchmark platforms.
- Changes to financial domain logic.

## Tasks

| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [B1](tasks/B1.md) | Define and validate the benchmark evidence contract | — | ready | — | — |
| [B2](tasks/B2.md) | Build the safe Run lifecycle and local publication shell | B1 | planned | — | — |
| [B3](tasks/B3.md) | Register dataset, correctness gates, and T13 read scenarios | B1, B2 | planned | — | — |
| [B4](tasks/B4.md) | Register the T14 correctness and load matrix | B1, B2, B3 | planned | — | — |
| [B5](tasks/B5.md) | Import existing T13 and T14 evidence | B1 | planned | — | — |
| [B6](tasks/B6.md) | Expose a development-only benchmark read API | B1, B2, B5 | planned | — | — |
| [B7](tasks/B7.md) | Add versioned Baseline selection | B1, B2, B6 | planned | — | — |
| [B8](tasks/B8.md) | Validate the integrated workflow and document operation | B1–B7 | planned | — | — |

## Acceptance Criteria Mapping

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| US-1..4 explicit complete command, clean revision, ignored Artifacts | B2 | executor integration | planned |
| US-5..6 note and provenance | B1, B2 | unit, executor integration | planned |
| US-7..10 dedicated database, reset, isolation, preflight | B3 | integration | planned |
| US-11..13 exclusive run and stale recovery | B2 | executor integration | planned |
| US-14..16 `RUNNING`, progress, live logs | B2, B6 | executor integration, e2e | planned |
| US-17..21 terminal outcomes and incomplete evidence | B2, B3, B4 | executor integration, integration | planned |
| US-22..25 failure details, sanitization, retained Artifacts, missing Artifact tolerance | B2, B6 | executor integration, e2e | planned |
| US-26..30 versioned Summary, no auto-commit, pending-change block | B2, B7 | executor integration, e2e | planned |
| US-31..34 imported history, provenance, absence, idempotence | B5 | importer fixtures | planned |
| US-35..37 T13/T14 protocols and percentiles | B3, B4 | unit, integration | planned |
| US-38..42 generic scenario and metric contract | B1 (B3, B4 for registration) | unit | planned |
| US-43..44 T13 and T14 metric coverage | B3, B4, B5 | integration, importer fixtures | planned |
| US-45..47 Runs list, detail, Artifact access | B6 | e2e | planned |
| US-48..51 default pair, compatibility, delta rules | B1, B6 | unit, e2e | planned |
| US-52..53 trend series and incomplete timeline entries | B6 | e2e | planned |
| US-54..58 Baseline selection | B1, B7 | unit, e2e | planned |
| US-59..63 development-only capability, no HTTP start, isolation | B6 | e2e | planned |
| US-64 OpenAPI coverage | B6, B8 | e2e contract | planned |
| US-65 command and HTTP boundary tests | B1–B8 | integration, e2e, manual | planned |

## Test Strategy

- Unit and contract: schema parsing, versions, deterministic serialization, fingerprints, lifecycle transitions, compatibility, metric direction, deltas, ±5% boundary, sanitization, safe identifiers.
- Integration: executor process boundary in a temporary Git repository; locking, atomic writes, recovery, generated-file report; small-dataset reset, isolation, invariants; reduced T13/T14 runs; importer on real trimmed fixtures.
- API e2e: capability on and off, list/detail/progress, pagination, Artifacts, traversal, malformed records, trends, compatibility, Baseline writes, OpenAPI contract.
- Manual: one complete Run on the approved machine after fast gates pass.
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, and the new `benchmark:run`.

## Risk Plan

- **Wrong database destroyed:** keep the name guard, resolve the target before any reset, keep the benchmark URL separate from `DATABASE_URL`, test refusal paths.
- **Concurrent workload corrupts results:** exclusive lock before any database work; report the owner.
- **Machine noise misleads:** preserve protocols, capture environment fingerprints, median and range, ±5% is presentation tolerance only.
- **Suite evolution breaks history:** fingerprint scenarios; compare per scenario.
- **Secrets in logs:** sanitize before storage and before exposure; path containment; representative secret formats tested.
- **Large Artifacts exhaust memory:** stream downloads, cap inline reads, paginate, never embed in Summaries.
- **Corrupt files:** validated schemas, atomic writes, malformed-record isolation.
- **Orphaned running record:** persist owner metadata and recover as incomplete.
- **Repository growth:** version only normalized Summaries; ignore Artifact root.
- **Remote exposure:** capability off outside development with production-mode e2e.
- **Flaky long tests:** controlled fake processes and reduced matrices; exact protocol only in manual validation.
- **Baseline surprises Git workflow:** never commit, disclose pending state, block the next Run until clean.
- **Importer invents data:** structured sources only, absent stays absent, fixture-pinned.

## Execution Order

1. B1 — evidence contract.
2. B2 — lifecycle shell and storage.
3. B3 — database preparation, gates, T13.
4. B4 — T14 matrix.
5. B5 — legacy import (can run in parallel with B3/B4 after B1).
6. B6 — read API.
7. B7 — Baseline.
8. B8 — integrated validation and docs.

## Open Questions

No blocking open questions. Assumption to confirm at B1: the contract lives under a new benchmark area separate from `src/domain/paylab`, so financial and benchmark code stay decoupled.

## Handoff

Ready for `task-runner` (or `tdd`). Start with B1.
