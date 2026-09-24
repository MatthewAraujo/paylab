# Tasks — Benchmark Observability

## Source Context

- Cross-project product requirements: [PRD.md](PRD.md).
- API project handbook and domain language: `../paylab-api/PROJECT.md`, `../paylab-api/CONTEXT.md`.
- UI project handbook and domain language: `../paylab-ui/PROJECT.md`, `../paylab-ui/CONTEXT.md`.
- Storage and exposure decision: `../paylab-api/docs/adr/0011-version-benchmark-summaries-and-retain-artifacts-locally.md`.
- Existing benchmark guide and evidence: `../paylab-api/docs/benchmark.md`, T13/T14 experiment documents, plans, text output, and JSONL under `../paylab-api/docs/experiments/`.
- Existing benchmark implementation: dataset generator and validation in `../paylab-api/bench/lib/` and `bench/run.ts`; T13 experiment helpers in `bench/exp/`; T14 correctness, strategies, load driver, matrix runner, and summarizer in `bench/exp/strategies/`.
- Existing API seams: Nest application composition, environment validation, health controller/module, Swagger generation, e2e application harness, and integration Testcontainers setup.
- Existing UI seams: generated OpenAPI snapshot/types, capability derivation, TanStack Query health feature, App Router console shell, reusable state components, Vitest/Testing Library, and Playwright navigation smoke test.
- Existing visual constraints: `../paylab-ui/docs/DESIGN-BRIEF.md` and `../paylab-ui/docs/BENCHMARKS-DESIGN-BRIEF.md`.
- Accepted benchmark visual direction and required implementation corrections: `../paylab-ui/docs/BENCHMARKS-DESIGN-REVIEW.md`.

## Implementation Goal

Create a reproducible local-only benchmark publication workflow that executes the complete PayLab Benchmark Suite from a clean revision, records normalized and versionable Benchmark Summaries plus indefinitely retained local Artifacts, exposes them through a development-only typed API, and presents overview, live progress, details, comparisons, Baseline selection, and historical trends in the Operational Console.

## Non-Goals

- Scheduled, CI-hosted, remote, push-triggered, or browser-triggered benchmark execution.
- Partial canonical runs or a scenario-selection CLI option.
- Dirty-worktree runs or automatic Git commits.
- Production access to benchmark endpoints or Artifacts.
- Automatic Artifact deletion, Run deletion UI, or repository storage for large logs/plans.
- Comparing incomplete, changed, or environment-incompatible measurements.
- Statistical significance claims, alerting, budgets, or automatic quality-gate failure from a five-percent delta.
- WebSockets, server-sent events, or a third-party benchmark platform.
- Redesigning existing financial pages or changing financial business logic.

## Acceptance Criteria Mapping

The PRD user stories are the acceptance criteria for this plan.

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| US-1..5 complete explicit command, clean revision, note, provenance | T1, T2 | unit, executor integration | planned |
| US-6..9 dedicated database, deterministic reset, isolation, preflight | T3 | integration, manual full run | planned |
| US-10..12 exclusive execution and abandoned-run recovery | T2 | executor integration | planned |
| US-13..19 lifecycle, progress, terminal outcomes, incomplete evidence | T1, T2 | unit, executor integration | planned |
| US-20..23 failure details, sanitization, indefinite local Artifacts, missing Artifact tolerance | T1, T2, T6 | unit, integration, API e2e | planned |
| US-24..28 versioned Summary, local Artifact boundary, manual commit workflow | T1, T2 | contract, executor integration | planned |
| US-29..31 imported T13/T14 history and honest absent values | T5 | importer fixture tests | planned |
| US-32..35 T13/T14 protocols and explicit future protocol metadata | T3, T4 | unit, integration, manual full run | planned |
| US-36..38 generic scenario and metric contract with fingerprints | T1 | unit/contract | planned |
| US-39..41 complete read and concurrency metric coverage | T3, T4, T5 | contract, integration, import fixture | planned |
| US-42 navigation separation | T8, T9 | component, browser smoke | design accepted; implementation planned |
| US-43..45 overview hierarchy and full-detail split | T7, T8, T9 | design review, component/integration | design accepted; implementation planned |
| US-46 active polling | T9 | component/integration | design accepted; implementation planned |
| US-47 complete sanitized Artifact view/download | T6, T10 | API e2e, component/integration | design accepted; implementation planned |
| US-48..54 default/custom/Baseline comparisons and versioned Baseline selection | T1, T7, T11 | unit, API e2e, component/integration | design accepted; implementation planned |
| US-55..59 per-scenario compatibility and new/removed/changed/environment states | T1, T6, T11 | unit, API e2e, component/integration | design accepted; implementation planned |
| US-60..64 values, deltas, directions, and five-percent classification | T1, T11 | unit, component/integration | design accepted; implementation planned |
| US-65..68 historical trends, Baseline, and incomplete timeline markers | T6, T12 | API e2e, component/integration | design accepted; implementation planned |
| US-69..72 development-only capability, honest unavailable state, terminal-only execution | T6, T7, T8 | env unit, API e2e, capability/component | design accepted; implementation planned |
| US-73 command, HTTP, and rendered-route validation | T2, T6, T9..T13 | integration, e2e, component, browser, manual | planned |

## T1 — Define and validate the benchmark evidence contract

Objective:

Create the versioned schemas and pure rules for Benchmark Runs, Summaries, scenarios, protocols, metrics, environment/dataset fingerprints, Artifacts, compatibility, Baselines, and Performance Changes.

Affected files / areas:

- New benchmark contract modules under the API benchmark area.
- JSON schema/version identifiers and deterministic serializer.
- Unit tests for parsing, normalization, fingerprints, compatibility, and comparison math.
- Example Summary fixtures shared by API tests and import tests.
- Optional explicit summary roles for measurements intentionally featured on the overview.

Test-first plan:

- Start with failing tests for valid native/imported/completed/incomplete/running records and rejection of malformed or unsafe records.
- Add boundary tests for desirable metric direction and exactly ±5% tolerance.
- Add scenario compatibility tests for unchanged, new, removed, changed, dataset-incompatible, and environment-incompatible cases.
- Add deterministic serialization and fingerprint tests.

Implementation notes:

- Keep contracts generic; T13/T14-specific configuration belongs in scenario payloads.
- Require deterministic overview selection from explicit summary-role metadata; the frontend must not guess featured measurements from names or ordering.
- Use an explicit schema version and reject unknown future versions safely.
- Represent unavailable imported measurements as absent, never zero.
- Keep Run lifecycle transitions explicit and terminal Summaries immutable.

Dependencies:

None.

Completion signal:

All evidence records and comparison decisions can be validated and calculated without filesystem, database, HTTP, or UI dependencies.

## T2 — Build the safe Run lifecycle and local publication shell

Objective:

Implement the terminal-only `benchmark:run` orchestration shell, clean-worktree enforcement, exclusive lock, optional note, progress persistence, process capture, sanitization, recovery, local Artifact layout, and terminal Summary publication.

Affected files / areas:

- API package scripts and benchmark CLI entrypoint.
- Git/environment preflight adapter.
- Local Run repository, lock, atomic writes, Artifact writer, log sanitizer, and recovery behavior.
- Gitignore rules for local Artifacts.
- Executor integration tests using temporary Git repositories, Artifact roots, and controlled child processes.

Test-first plan:

- Write failing process-boundary tests for dirty/untracked worktrees, an existing active lock, optional note capture, `RUNNING` progress, successful completion, child failure, interruption recovery, sensitive-output redaction, atomic Summary write, generated-file report, and no automatic commit.

Implementation notes:

- Resolve and validate all destructive/storage paths before use.
- Use atomic replace for mutable running state and immutable final output.
- Scope redaction to configured secrets plus recognizable database URL and credential forms.
- A subsequent invocation must fail while versioned changes remain pending.

Dependencies:

T1.

Completion signal:

A controlled fake suite produces observable native `COMPLETED` and `INCOMPLETE` Runs safely, and every accepted lifecycle behavior is covered without invoking the heavy benchmark.

## T3 — Register dataset, correctness, and T13 read scenarios

Objective:

Turn benchmark preparation, deterministic reset, validation, correctness gates, and the current T13 read/query-plan experiments into registered scenarios executed by the lifecycle shell.

Affected files / areas:

- Benchmark database bootstrap/reset helpers and existing destructive-name guard.
- Dataset seed/statistics helpers and existing invariant integration seam.
- T13 suite/query helpers and plan capture.
- Scenario registry and normalized T13 metric adapters.
- Small-dataset integration tests.

Test-first plan:

- Add failing tests for preflight failures, forbidden database names, deterministic reset, isolation between mutating groups, invariant-gate failure, protocol metadata, median calculation, query metric normalization, and plan Artifact registration.

Implementation notes:

- Reuse the existing dataset generator and invariant helper rather than duplicating correctness logic.
- Preserve one warm-up plus seven measured T13 executions.
- Replace experiment-only output parsing only where a structured adapter is necessary; retain raw plans as Artifacts.
- Never run full destructive setup inside the fast unit gate.

Dependencies:

T1, T2.

Completion signal:

The executor can prepare a safe small benchmark database and publish structured T13 read metrics and plans with correctness gates.

## T4 — Register the T14 correctness and load matrix

Objective:

Integrate the T14 strategy correctness checks and full load matrix with structured progress, protocol metadata, normalized throughput/latency/contention metrics, and isolated resets.

Affected files / areas:

- T14 correctness, strategy, load-driver, matrix, and summarization code.
- Scenario registry and structured adapters for shapes, clients, strategies, sync mode, and repetitions.
- Integration tests with a reduced deterministic matrix.

Test-first plan:

- Add failing tests for the two-second warm-up/ten-second window/three-repetition definition, median/range aggregation, complete metric mapping, rotated strategy order, per-cell reset, correctness-gate failure, incomplete publication, and reduced-matrix progress.

Implementation notes:

- Preserve the accepted full protocol and Latin-square order.
- Test orchestration with reduced durations and cells; do not weaken the production scenario definition.
- Normalize every current JSONL field, including debit/credit percentiles and PostgreSQL counters.

Dependencies:

T1–T3.

Completion signal:

The complete suite registry covers T13 and T14, and a reduced automated run proves orchestration while the full matrix remains a documented manual validation.

## T5 — Import existing T13 and T14 evidence

Objective:

Create a one-time deterministic importer that reconstructs honest Imported Benchmark Runs from the current experiment documents and raw evidence.

Affected files / areas:

- Import command/module and mapping fixtures.
- Existing T13/T14 documents, JSONL, summary tables, raw text, and query plans as read-only sources.
- Generated versioned imported Summaries.

Test-first plan:

- Write fixture tests that pin representative source values, separate T13 and T14 Run identities, imported provenance, absent values, protocol/environment metadata, duplicate-import idempotence, and malformed-source failure.

Implementation notes:

- Do not scrape prose when a structured raw source exists.
- Preserve existing plans as versioned legacy evidence or referenced existing files; do not duplicate large content.
- Imported Runs are terminal historical records and never imply live progress.

Dependencies:

T1.

Completion signal:

T13 and T14 appear as separate validated imported records with traceable source evidence and no inferred combined execution.

## T6 — Expose a development-only benchmark API

Objective:

Add typed Nest endpoints for capability/status, paginated Runs, Run detail/progress, compatible comparison metadata, trends, sanitized Artifact metadata/content/download, and local availability enforcement.

Affected files / areas:

- Environment schema and example configuration.
- New benchmark HTTP module, controller, service/repository adapters, DTOs, presenters, and Swagger metadata.
- Application composition and HTTP security/path containment.
- API unit and e2e fixtures/tests.

Test-first plan:

- Add failing e2e tests for disabled production behavior, enabled development capability, list/detail ordering and pagination, active progress, imported/incomplete records, missing Artifact response, log content/download, range or bounded reads where applicable, path traversal rejection, redaction defense, compatibility metadata, trends, malformed Summary isolation, and no benchmark-database dependency for read endpoints.

Implementation notes:

- Default the capability off outside development and do not expose arbitrary filesystem paths.
- Keep benchmark reads outside financial authentication and repositories; the capability is a local developer surface.
- Serve only records that pass T1 validation.
- Define bounded payloads for logs and paginated history to protect the API process.

Dependencies:

T1, T2, T5.

Completion signal:

OpenAPI fully describes a safe local read API, and production-mode e2e tests prove the surface is unavailable.

## T7 — Add versioned Baseline mutation

Objective:

Allow a confirmed local UI action to select one eligible completed Benchmark Run as the versioned Baseline without mutating Run evidence.

Affected files / areas:

- Baseline reference contract/repository and atomic write behavior.
- Benchmark API Baseline read/write endpoints and Swagger DTOs.
- Git-pending-state response metadata.
- Unit and API e2e tests.

Test-first plan:

- Add failing tests for selecting a completed native/imported eligible Run, rejecting running/incomplete/missing candidates, preserving immutable Summaries, replacing the pointer atomically, reporting the pending Git change, and leaving the next executor invocation blocked until clean.

Implementation notes:

- The API must not commit the Baseline reference.
- Baseline lineage and compatibility are validated through T1 rules.
- The endpoint is available only when the benchmark capability is enabled locally.

Dependencies:

T1, T2, T6.

Completion signal:

The API can safely persist, read, replace, and disclose a reviewable Baseline pointer while preserving Run immutability.

## T8 — Produce and approve the benchmark design handoff — done

Objective:

Publish the benchmark-specific design brief and review the returned external design against the PRD, domain language, real API states, responsiveness, accessibility, and scope before visual implementation.

Affected files / areas:

- `paylab-ui/docs/BENCHMARKS-DESIGN-BRIEF.md`.
- External design artifacts supplied by the user.
- Optional review notes or accepted screenshots linked from UI documentation.

Test-first plan:

- Use a documentation checklist rather than executable tests: every required route, state, metric hierarchy, comparison state, trend, Artifact interaction, confirmation, responsive frame, and accessibility constraint must be represented or explicitly delegated to an existing shared pattern.

Implementation notes:

- The brief does not prescribe invented metrics or remote execution controls.
- The review accepted the visual direction with implementation corrections for incomplete measurements, separate T13/T14 imports, comparison-state counts, shell integration, headline selection, and typography.
- T9–T12 must apply `paylab-ui/docs/BENCHMARKS-DESIGN-REVIEW.md` rather than copy the prototype directly.

Dependencies:

PRD and this plan; API contract shapes from T1/T6 may refine labels but not scope.

Completion signal:

Completed: the benchmark brief exists and the returned design has a documented pass against the acceptance checklist, with required scope corrections incorporated into the PRD and plan.

## T9 — Establish the frontend benchmark capability and overview

Objective:

Regenerate the typed client, add Benchmarks navigation and capability behavior, and implement the overview with latest status, prioritized metrics, regressions, scenario groups, recent history, loading/empty/error/unavailable states, and active polling.

Affected files / areas:

- OpenAPI snapshot/generated types and capability registry.
- App shell navigation and new benchmark routes/features.
- Benchmark API adapter/query keys and generic metric presentation primitives.
- Overview and polling tests.

Test-first plan:

- Write rendered-route tests for unavailable capability, no Runs, API error/retry, latest completed Run, latest incomplete Run, active progress updates, polling stop at terminal state, prioritized metrics, regression list, recent history, and keyboard-accessible navigation.

Implementation notes:

- Follow the approved T8 design and existing Server Component/client interaction split.
- Poll only while the current Run is active and retain visible data during refresh.
- Never display absent metrics as zero.

Dependencies:

T6, T8.

Completion signal:

The English-language Benchmarks overview renders real typed API data and every shared state honestly at desktop and mobile widths.

## T10 — Implement Run detail and Artifact diagnosis

Objective:

Implement complete Run provenance, protocol, scenario, metric, progress, failure, and Artifact views, including bounded full-log viewing and download.

Affected files / areas:

- Run detail route and feature components.
- Generic scenario/metric tables and provenance panels.
- Artifact list/viewer/download adapter.
- Component/integration tests.

Test-first plan:

- Write rendered-route tests for native/imported/running/completed/incomplete Runs, diagnostic measurements completed before an incomplete failure, separate imported T13/T14 evidence, missing values, missing local Artifacts, failed scenario evidence, sanitized log rendering, large-log interaction, download link, identifiers, and accessible non-color status cues.

Implementation notes:

- Preserve generic rendering for future metrics.
- Separate normalized measurements from diagnostic Artifacts visually.
- Separate incomplete diagnostic measurements from comparable evidence and state that they are ineligible for comparison.
- Never render arbitrary HTML from log content.

Dependencies:

T6, T8, T9.

Completion signal:

Every persisted Run state and all available normalized evidence can be inspected without using repository files or terminal logs directly.

## T11 — Implement selectable Benchmark Comparisons

Objective:

Implement previous-by-default, custom, and Baseline comparisons with per-scenario compatibility and direction-aware Performance Change presentation.

Affected files / areas:

- Pure frontend comparison formatter/classifier using T1 contract semantics.
- Comparison route, selectors, scenario states, metric tables/charts, and Baseline action/confirmation.
- Unit and rendered-route tests.

Test-first plan:

- Add unit tests for absolute/percentage deltas, zero-reference handling, desirable directions, exact tolerance boundaries, and missing values.
- Add rendered tests for default previous selection, arbitrary selection, Baseline selection/action, pending Git warning, separate incompatible and not-recorded counts, new/removed/changed/incompatible scenarios, stable/improved/regressed labels, and incomplete Run exclusion.

Implementation notes:

- Always show raw values and deltas alongside classification.
- Require text/icon/shape in addition to color.
- Treat five percent as presentation tolerance, not statistical significance.

Dependencies:

T1, T6, T7, T8, T9.

Completion signal:

A developer can compare any eligible pair safely, understand incompatibilities, and set a reviewable Baseline from the UI.

## T12 — Implement historical metric trends

Objective:

Add scenario/metric trend visualization across compatible completed Runs, with Baseline reference and incomplete timeline markers.

Affected files / areas:

- Trend query adapter and chart/presentation component selected during design review.
- Accessible tabular alternative.
- Trend tests.

Test-first plan:

- Write tests for scenario/metric selection, chronological ordering, compatibility filtering, absent values, Baseline marker, incomplete Run marker without a metric point, empty history, and accessible value representation independent of the chart.

Implementation notes:

- Avoid a chart dependency until the approved design proves it is needed; prefer the smallest accessible solution.
- Do not connect incompatible points into one visual series.

Dependencies:

T6, T8, T9, T11.

Completion signal:

A developer can inspect a metric's compatible history and Baseline without relying solely on visual color or pointer interaction.

## T13 — Validate the integrated workflow and document operation

Objective:

Validate the full command-to-console workflow, update stable project handbooks and benchmark instructions, and record the first native full Benchmark Run.

Affected files / areas:

- API and UI PROJECT handbooks only where stable commands/capabilities changed.
- Benchmark guide, environment examples, operational/runbook documentation, OpenAPI snapshot, and browser smoke tests.
- First generated native Summary and local Artifacts.

Test-first plan:

- Add or update the Playwright smoke test for navigation, overview, comparison selection, Run detail, and local API integration.
- Run all automated quality gates before the manual full suite.
- Perform one complete local Run from a clean committed revision and verify live progress, terminal Summary, Git changes, Artifact rendering, comparison with imported history where compatible, and production capability disablement.

Implementation notes:

- Inspect install/generation commands before running them and do not overwrite unrelated work.
- Keep detailed decisions/context out of PROJECT handbooks; link to PRD, plan, ADR, and benchmark guide.
- Do not claim full success if the expensive local suite was not completed.

Dependencies:

T1–T12.

Completion signal:

Automated gates pass, the production build exposes no benchmark capability, one full native Run is reviewed, the local console displays it correctly, and operating documentation is current.

## Test Strategy

### Unit and contract

- Summary/schema parsing and version handling.
- Deterministic serialization and scenario/environment/dataset fingerprints.
- Lifecycle transitions and terminal immutability.
- Sanitization and safe Artifact identifiers.
- Compatibility decisions, metric direction, zero/missing values, deltas, and ±5% boundaries.
- T13/T14 aggregation and importer normalization.

### Integration

- Executor process boundary in a temporary Git repository and Artifact root.
- Safe locking, atomic writes, interruption recovery, child-process failures, and generated Git changes.
- Small deterministic benchmark database reset, validation, invariants, scenario isolation, and reduced T13/T14 runs.
- Import of representative real T13/T14 evidence.

### API e2e

- Development enablement and production disablement.
- Run list/detail/progress, pagination, trends, compatibility, malformed-record isolation, Artifact content/download, missing files, traversal rejection, and Baseline mutation.
- Typed OpenAPI contract generation.

### Frontend component/integration

- Capability states, overview, polling lifecycle, detail, logs, comparison, Baseline confirmation, trends, responsive behavior, and accessible non-color meaning.
- Controlled HTTP responses at the existing network seam; no production mock mode.

### Browser and manual

- Playwright smoke through the built/running UI and configured local API.
- One full local Benchmark Suite on the approved machine after all fast gates pass.
- Manual verification that Summaries are reviewable, Artifacts remain out of Git, logs are sanitized, and no endpoint is available in production mode.

### Expected commands

- API: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`.
- UI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm sync:api` or `pnpm generate:api` as appropriate.
- Final local validation: the new full benchmark command from a clean committed revision.

## Risk Plan

- **Wrong database destroyed:** retain the benchmark-name guard, resolve the target before reset, separate the benchmark URL from `DATABASE_URL`, and cover refusal paths.
- **Concurrent workload corrupts measurements:** acquire an exclusive Run lock before any database work and report the active owner.
- **Machine noise creates false conclusions:** preserve warm-up/repetition protocols, capture environment fingerprints, use median/range, and label 5% as tolerance rather than significance.
- **Suite evolution breaks history:** fingerprint scenarios and compare compatible intersections instead of entire suite membership.
- **Secrets leak through logs:** sanitize before persistence and again before exposure, use path containment, and test representative secret formats.
- **Large Artifacts exhaust memory or HTTP:** stream/download files, bound inline views, paginate history, and never embed Artifacts into Summaries.
- **Filesystem corruption leaves invalid state:** use validated schemas and atomic writes; isolate malformed records rather than failing the whole history.
- **An interrupted process remains active forever:** persist ownership metadata and recover stale running records as incomplete.
- **Repository grows uncontrollably:** version normalized Summaries only and keep Artifact roots ignored.
- **UI implies unsupported certainty:** show absent/incompatible/new/removed states explicitly and always expose source/reference values.
- **Frontend exposes local diagnostics remotely:** capability defaults off outside development, with e2e proof in production mode.
- **Long benchmark makes tests flaky:** use controlled process fixtures and reduced matrices in automation; reserve the exact full protocol for manual validation.
- **External design expands scope:** evaluate it against the benchmark brief and PRD before implementation; reject invented execution actions, metrics, or production behavior.
- **Baseline mutation surprises Git workflow:** require confirmation, expose pending state, never commit automatically, and let clean-tree enforcement block the next Run.

## Execution Order

1. T1 — evidence contract and pure rules.
2. T2 — safe executor lifecycle and local storage.
3. T3 — database preparation, correctness gates, and T13.
4. T4 — T14 full suite registration.
5. T5 — legacy T13/T14 import.
6. T6 — development-only read API.
7. T7 — Baseline persistence API.
8. T8 — benchmark design brief, external design, and scope review gate.
9. T9 — frontend capability, navigation, overview, and live progress.
10. T10 — Run detail and Artifacts.
11. T11 — comparison and Baseline UX.
12. T12 — trends.
13. T13 — integrated validation, documentation, and first native full Run.

T8 may proceed in parallel with T1–T7 after the brief is published, but T9–T12 must wait for both the relevant API contract and accepted design.

## Open Questions

No blocking open questions.

## Handoff to tdd

Ready for tdd. The external benchmark design is accepted with the corrections recorded in `paylab-ui/docs/BENCHMARKS-DESIGN-REVIEW.md`. Start T1 by writing the failing evidence-contract tests; apply the accepted design only when T9 begins against the real API contract.
