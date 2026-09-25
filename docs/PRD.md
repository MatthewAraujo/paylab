# PRD — Benchmark Observability

## Problem Statement

PayLab already has substantial performance evidence in `paylab-api/bench` and the T13 and T14 experiment records, but that evidence is fragmented across Markdown, JSONL, query plans, and console output. A developer must inspect files manually to understand throughput, latency percentiles, contention, failures, and the effect of a change. The current format also provides no unified history, no default comparison with the previous execution, no stable Baseline comparison, and no visual indication of improvement or regression.

The developer runs benchmarks manually on one approved local machine after meaningful application or benchmark changes. They need one explicit command that always runs the complete known Benchmark Suite, publishes its progress automatically, retains failure evidence, and makes the resulting metrics visible in the PayLab Operational Console without turning benchmark data into financial production state or exposing diagnostic logs remotely.

## Solution

Add local benchmark observability across PayLab API and PayLab UI.

An explicit terminal command runs the entire Benchmark Suite from a clean Git worktree against the dedicated, disposable `paylab_bench` database. The executor creates a Benchmark Run, publishes incremental progress and sanitized Benchmark Artifacts locally, and finishes with an immutable `COMPLETED` or `INCOMPLETE` Benchmark Summary. Small normalized Summaries are reviewed and committed to Git manually; large logs and plans are retained locally without automatic expiration.

A development-only API exposes Runs, progress, Summaries, Artifacts, comparison compatibility, and the selected Benchmark Baseline. The Operational Console adds a top-level Benchmarks area with a concise latest-run overview, live polling while a Run is active, full run details, selectable two-run comparisons, historical trends, imported T13/T14 evidence, sanitized logs, and a confirmed action for selecting a versioned Baseline.

## User Stories

1. As a PayLab developer, I want one command to run the complete Benchmark Suite, so that published results always represent all benchmarks known by that source revision.
2. As a PayLab developer, I want benchmark execution to be explicit, so that a long and destructive benchmark workload never starts from a page visit, application boot, push, or schedule.
3. As a PayLab developer, I want the command to reject a dirty worktree, so that every Run is attributable to an exact committed source revision.
4. As a PayLab developer, I want an optional intent note on a Run, so that I can recognize why an old measurement was produced.
5. As a PayLab developer, I want branch, commit, timestamp, environment, dataset, suite, and scenario configuration captured automatically, so that performance evidence retains its provenance.
6. As a PayLab developer, I want the command to use only a database whose name visibly identifies it as a benchmark database, so that development or production data cannot be reset accidentally.
7. As a PayLab developer, I want the benchmark database restored to a deterministic state before execution, so that Runs begin from comparable data.
8. As a PayLab developer, I want data-mutating scenario groups isolated by deterministic database restoration, so that an earlier scenario cannot bias a later scenario.
9. As a PayLab developer, I want environment, Docker, PostgreSQL, migration, template, dataset, and invariant preflight checks, so that invalid measurements fail before being presented as evidence.
10. As a PayLab developer, I want only one Benchmark Run active at a time, so that competing workloads cannot corrupt results.
11. As a PayLab developer, I want a second command invocation to report the active Run and current stage, so that accidental concurrency is understandable.
12. As a PayLab developer, I want an abandoned active Run recovered as `INCOMPLETE`, so that interruption does not leave a permanently running record.
13. As a PayLab developer, I want a Run to enter `RUNNING` before the first scenario starts, so that the Operational Console can observe current progress.
14. As a PayLab developer, I want progress to identify completed, active, pending, and failed scenarios, so that I can locate slow or blocked work.
15. As a PayLab developer, I want logs to become visible while the suite runs, so that I can diagnose progress without switching constantly to the terminal.
16. As a PayLab developer, I want a successful full suite to produce a `COMPLETED` Run, so that it is eligible for comparison and Baseline selection.
17. As a PayLab developer, I want a failed or interrupted suite to produce an `INCOMPLETE` Run, so that the failure remains discoverable.
18. As a PayLab developer, I want completed measurements from an incomplete execution retained, so that useful diagnostic evidence is not discarded.
19. As a PayLab developer, I want incomplete Runs excluded from performance comparisons and Baseline selection, so that partial evidence does not become a reference.
20. As a PayLab developer, I want failure details to include the scenario, command, timestamps, duration, exit status, summary, and full sanitized log, so that I can determine why it failed.
21. As a PayLab developer, I want connection strings, credentials, and sensitive environment values removed from exposed logs, so that diagnostic visibility does not leak secrets.
22. As a PayLab developer, I want Benchmark Artifacts retained locally without automatic expiration, so that old failures and plans remain available until I explicitly remove them.
23. As a PayLab developer, I want Benchmark Summaries to remain useful when a local Artifact is unavailable, so that durable history does not depend on one filesystem forever.
24. As a PayLab developer, I want small normalized Summaries committed to Git, so that the important historical evidence follows the repository.
25. As a PayLab developer, I want large logs and query plans excluded from Git, so that performance history does not cause uncontrolled repository growth.
26. As a PayLab developer, I want the executor to avoid automatic Git commits, so that I can review generated evidence before preserving it.
27. As a PayLab developer, I want the command to report generated files and suggest a commit message, so that publishing a reviewed Summary is straightforward.
28. As a PayLab developer, I want another Run blocked while a generated Summary or Baseline change remains uncommitted, so that every new Run starts from a clean revision.
29. As a PayLab developer, I want T13 and T14 results imported, so that the new console preserves existing performance work from its first release.
30. As a PayLab developer, I want imported Runs clearly identified, so that historical reconstruction is not confused with native executor output.
31. As a PayLab developer, I want missing legacy values to remain absent, so that import never invents measurements.
32. As a PayLab developer, I want the current T13 read protocol preserved, so that one warm-up and seven measured executions continue to produce a median query latency.
33. As a PayLab developer, I want the current T14 load protocol preserved, so that a two-second warm-up, ten-second window, and three repetitions continue to produce median and range results.
34. As a PayLab developer, I want percentiles calculated from measured request samples, so that p50, p95, and p99 retain their current meaning.
35. As a PayLab developer, I want every scenario to declare warm-up, duration, repetitions, and aggregation, so that future protocols can evolve explicitly.
36. As a PayLab developer, I want new scenarios to appear automatically when they follow the benchmark contract, so that adding a benchmark does not require a bespoke page.
37. As a PayLab developer, I want every scenario to have a stable identity and definition fingerprint, so that changed workloads are not compared as if they were identical.
38. As a PayLab developer, I want every metric to declare its key, label, unit, desirable direction, and value, so that generic visualizations interpret it correctly.
39. As a PayLab developer, I want throughput, latency, reliability, contention, environment, dataset, and protocol data preserved, so that a Run can be evaluated in context.
40. As a PayLab developer, I want T13 query latency and plan evidence available, so that read and index behavior remains observable.
41. As a PayLab developer, I want T14 TPS, debit/credit TPS, p50/p95/p99, retries, serialization failures, version conflicts, deadlocks, exhausted operations, failed payments, lock acquisition, lock waiters, rollbacks, and sample counts available, so that concurrency behavior remains explainable.
42. As a PayLab developer, I want a top-level Benchmarks navigation item, so that technical performance evidence is separate from financial activity.
43. As a PayLab developer, I want the Benchmarks overview to emphasize TPS, p99, error or failure rate, total duration, and notable regressions, so that I can assess the latest Run quickly.
44. As a PayLab developer, I want the overview to summarize scenario groups, so that I can move from overall status to the relevant experiment family.
45. As a PayLab developer, I want complete metrics in the Run detail rather than all on the overview, so that no data is lost while the primary screen remains readable.
46. As a PayLab developer, I want the console to poll while a Run is active, so that progress appears automatically without a manual refresh or WebSocket infrastructure.
47. As a PayLab developer, I want to inspect and download complete sanitized Artifacts from a Run detail, so that the browser can support diagnosis.
48. As a PayLab developer, I want the latest completed Run compared with the previous compatible Run by default, so that the most recent change is immediately visible.
49. As a PayLab developer, I want to select any other eligible Run for comparison, so that I can investigate a specific revision or experiment.
50. As a PayLab developer, I want to retain one deliberate Benchmark Baseline per compatible benchmark lineage, so that long-term performance remains anchored to a stable reference.
51. As a PayLab developer, I want to compare against both the previous compatible Run and the Baseline, so that short-term and long-term change are distinct.
52. As a PayLab developer, I want to select a Baseline from a completed Run in the interface with confirmation, so that reference management is deliberate and convenient.
53. As a PayLab developer, I want Baseline selection persisted as a small versioned reference rather than modifying the Run, so that Runs remain immutable.
54. As a PayLab developer, I want a Baseline change to leave a reviewable Git change, so that the reference history is auditable.
55. As a PayLab developer, I want comparisons evaluated per scenario, so that adding a new benchmark does not invalidate unchanged historical measurements.
56. As a PayLab developer, I want new scenarios labeled as having no previous measurement, so that absence is not rendered as zero.
57. As a PayLab developer, I want removed scenarios visible only on the older side, so that suite evolution is understandable.
58. As a PayLab developer, I want changed scenarios labeled incompatible, so that different workloads never produce misleading deltas.
59. As a PayLab developer, I want machine, PostgreSQL, dataset, or critical configuration incompatibility to block affected comparisons, so that environmental changes do not masquerade as application regressions.
60. As a PayLab developer, I want each comparable metric to show current value, reference value, absolute delta, and percentage delta, so that visual classification is backed by numbers.
61. As a PayLab developer, I want changes within five percent classified as stable, so that ordinary measurement noise is not highlighted as a regression.
62. As a PayLab developer, I want throughput increases treated as improvements, so that metric direction is interpreted correctly.
63. As a PayLab developer, I want lower latency, error, contention, retry, and failure measurements treated as improvements, so that negative deltas are interpreted correctly.
64. As a PayLab developer, I want raw values and deltas visible even when classified stable, so that the threshold does not hide evidence.
65. As a PayLab developer, I want a historical trend for a selected scenario and metric, so that gradual degradation is visible across more than two Runs.
66. As a PayLab developer, I want trend charts limited to completed compatible measurements, so that the line represents comparable evidence.
67. As a PayLab developer, I want the Baseline visible on a trend, so that long-term deviation is easy to recognize.
68. As a PayLab developer, I want incomplete Runs visible on the timeline without comparative values, so that operational failures remain part of the history.
69. As a PayLab developer, I want benchmark capabilities unavailable outside local development by default, so that logs and local control operations are not exposed remotely.
70. As a PayLab developer, I want the frontend to show an honest unavailable state when the API disables benchmarks, so that absence is not mistaken for a loading error.
71. As a PayLab developer, I want starting a Run restricted to the terminal, so that the UI cannot trigger a long destructive workload accidentally.
72. As a PayLab developer, I want the console to observe Runs and manage only the Baseline, so that measurement production remains separate from presentation.
73. As a PayLab developer, I want automated tests at command, HTTP, and rendered-route boundaries, so that the workflow remains reliable while internals evolve.

## Implementation Decisions

- Benchmark observability spans the API and Operational Console but does not join the financial domain or become financial source-of-truth data.
- The canonical executor is an explicit package command that always runs the complete Benchmark Suite known by its clean source revision. It accepts an optional intent note and has no scenario-selection option.
- The executor refuses tracked or untracked worktree changes. Gitignored local Artifact files do not make the worktree dirty.
- Starting a Run remains terminal-only. The Operational Console does not expose an execution action.
- The executor uses an exclusive local lock. A concurrent invocation exits unsuccessfully and reports the active Run.
- The dedicated benchmark database retains the current destructive-name safeguard. Preflight and reset operations never target the development or test databases.
- Every full execution validates prerequisites and restores deterministic data before the suite. Scenario groups that mutate data receive isolated restored state.
- Existing T13 reads and T14 concurrency experiments become registered scenario groups. The correctness and invariant checks are gates; a violation makes the Run incomplete even when performance samples exist.
- Benchmark protocols belong to scenario definitions. The initial T13 and T14 protocols preserve their current warm-up, measurement windows, repetition counts, and aggregations.
- Scenario definitions have stable IDs and fingerprints. A fingerprint includes workload and measurement semantics that could change comparability.
- Metrics use a generic normalized contract containing a stable key, label, numeric value, unit, desirable direction, aggregation context, and optional explicit summary role for overview highlights. Scenario-specific configuration remains attached to the scenario rather than encoded into metric names, and the frontend never guesses headline measurements from names or ordering.
- A Run captures source revision, branch, optional note, timestamps, durations, executor/schema versions, environment fingerprint, database configuration, dataset fingerprint, suite membership, scenario definitions, progress, outcome, and Artifact references.
- Benchmark Run Status is `RUNNING`, `COMPLETED`, or `INCOMPLETE`. Terminal states are immutable. Startup recovery changes an abandoned running record to incomplete with interruption evidence.
- Small Benchmark Summaries are stored as deterministic, reviewable, version-controlled JSON. Generated Summaries are never committed automatically.
- Large Benchmark Artifacts are stored outside Git, organized by Run, sanitized before API exposure, and retained without automatic expiration.
- Sanitization is allowlist-oriented for environment metadata and redacts database URLs, credentials, secrets, and configured sensitive patterns from process output.
- The initial migration reconstructs T13 and T14 as separate Imported Benchmark Runs from existing trustworthy documents and raw files. Imported provenance and unavailable fields remain explicit; the importer never invents one combined historical execution.
- A versioned Baseline reference points to a completed Run without mutating it. Baseline selection is a development-only API write initiated from a confirmed UI action.
- Benchmark API capability is disabled by default outside development. The frontend derives availability honestly from the generated OpenAPI contract and runtime response, consistent with existing Capability Availability behavior.
- API reads are responsible for safe Summary and Artifact discovery, path containment, validation, pagination, and Artifact streaming. Arbitrary filesystem paths are never accepted from clients.
- The API identifies comparison compatibility, including environment and per-scenario definition compatibility. The frontend calculates and renders metric deltas and the accepted five-percent Performance Change classification from normalized values.
- The default comparison selects the newest completed Run and its immediately previous compatible Run. Users can select another eligible Run or the Baseline.
- Comparison is per scenario. New, removed, changed, and environment-incompatible cases are represented explicitly rather than coerced into numeric deltas.
- The Benchmarks area has an overview, a selectable comparison surface, and a Run detail. Historical trends are available from the overview or comparison context without requiring a separate execution workflow.
- The overview prioritizes overall status, TPS, p99, error/failure rate, duration, notable regressions, scenario-group summaries, and recent Runs. All normalized metrics remain available in Run detail.
- Active Runs use bounded periodic polling through the existing TanStack Query integration. Polling stops in a terminal state. WebSockets and server-sent events are not introduced.
- The UI remains English-language and uses generic metric presentation first. Specialized visualizations are added only when the generic contract cannot communicate a material relationship.
- Baseline changes and generated Summaries leave the worktree dirty for explicit review. A subsequent Run is rejected until those changes are committed or removed.
- The accepted storage and exposure boundary is recorded in API ADR 0011.

## Testing Decisions

- Tests assert observable behavior and durable contracts rather than internal function calls, component structure, polling implementation, or process-wrapper details.
- The primary executor seam is an integration test that invokes the command in a temporary clean Git repository with a temporary Artifact root and controlled scenario processes. It covers clean-tree enforcement, optional notes, exclusive locking, lifecycle transitions, progress, successful Summary publication, incomplete recovery, sanitization, and generated-file reporting.
- The expensive complete T13/T14 workload is a documented manual validation because its runtime and Docker resource usage are inappropriate for the fast automated gate.
- Existing small deterministic benchmark dataset and invariant tests remain the database correctness seam. Additional integration coverage verifies reset isolation without exercising the full million-payment dataset.
- Pure contract tests cover Summary validation, deterministic serialization, scenario fingerprinting, environment compatibility, per-scenario compatibility, metric direction, absolute and percentage deltas, and the five-percent stable boundary.
- API e2e tests exercise the HTTP boundary using real Summary and Artifact fixtures. They cover list/detail/progress, pagination, imported and incomplete Runs, Artifact display/download, path traversal rejection, redaction, Baseline writes, invalid Baseline candidates, development availability, and production disablement.
- Frontend route/component integration tests use controlled HTTP responses at the existing network boundary. They cover capability unavailable, overview, active polling, terminal polling stop, empty and error states, comparison selection, new/removed/incompatible scenarios, threshold classification, trends, detail, missing Artifacts, full sanitized logs, and Baseline confirmation.
- A browser smoke test verifies Benchmarks navigation, latest Run rendering, comparison selection, Run detail, and a configured local API connection.
- Imported T13/T14 fixture tests prove that source values are preserved, absent values remain absent, and provenance is labeled imported.
- Validation includes lint, typecheck, unit/component tests, API integration/e2e tests, frontend browser smoke tests, builds, OpenAPI regeneration, and one documented manual full Benchmark Run on the approved local machine.

## Out of Scope

- Scheduled, push-triggered, pull-request, CI-hosted, or remote benchmark execution.
- Starting, cancelling, pausing, or selecting a partial Benchmark Suite from the Operational Console.
- Running only one scenario through the canonical publication command.
- Publishing a Run from a dirty Git worktree.
- Automatic Git commits, pushes, tags, or pull requests.
- Automatic deletion or retention expiry for Benchmark Artifacts.
- Storing large logs or query plans in Git.
- Treating imported data as complete when the source did not record a measurement.
- Comparing incomplete Runs or selecting one as a Baseline.
- Comparing changed scenarios or incompatible environments by coercing values.
- Statistical significance modeling beyond the accepted protocol aggregation and five-percent presentation tolerance.
- Alerts, notifications, budgets, service-level objectives, or automatic build failure based only on a performance regression.
- WebSocket or server-sent-event infrastructure.
- Remote or production exposure of Benchmark Summaries, Artifacts, or Baseline mutation.
- A UI for deleting Runs or Artifacts.
- Replacing the existing benchmark database, experiment documents, or correctness checks with a third-party benchmarking platform.

## Further Notes

- The approved execution environment is the developer's local machine. Environment fingerprints still matter because hardware, PostgreSQL version/settings, Node version, dataset, or Docker configuration may change over time.
- Current T13 evidence is primarily query timing, query-plan, dataset, and index-design data; current T14 evidence is structured JSONL load data plus correctness and summary documents. The importer must respect those differences.
- The five-percent tolerance is a presentation rule, not a claim of statistical significance. Protocols and thresholds may evolve as PayLab gathers more repeated evidence.
- Existing project memory defines a Benchmark Run, Benchmark Run Status, Benchmark Suite, Benchmark Summary, Benchmark Baseline, Benchmark Comparison, Comparable Benchmark Scenario, Performance Change, Incomplete Benchmark Run, Imported Benchmark Run, and Benchmark Artifact.
