# PRD — Benchmark Observability (API)

Scope: the `paylab-api` side of benchmark observability — the executor, local evidence storage, the imported history, and the development-only HTTP surface. The Operational Console (`paylab-ui`) is a consumer of the contract defined here and is planned separately; the cross-project draft lives in `../../../docs/PRD.md`.

## Problem Statement

PayLab already has substantial performance evidence in `bench/` and the T13 and T14 experiment records, but it is fragmented across Markdown, JSONL, query plans, and console output. A developer must inspect files manually to understand throughput, latency percentiles, contention, failures, and the effect of a change. There is no unified history, no machine-readable comparison with the previous execution, no stable Baseline, and no way for a client to tell whether two measurements are comparable.

The developer runs benchmarks manually on one approved local machine after meaningful application or benchmark changes. They need one explicit command that always runs the complete known Benchmark Suite, publishes progress automatically, retains failure evidence, and exposes the resulting evidence through a typed API — without turning benchmark data into financial production state or exposing diagnostic logs remotely.

## Solution

An explicit terminal command runs the entire Benchmark Suite from a clean Git worktree against the dedicated, disposable `paylab_bench` database. The executor creates a Benchmark Run, publishes incremental progress and sanitized Benchmark Artifacts locally, and finishes with an immutable `COMPLETED` or `INCOMPLETE` Benchmark Summary. Small normalized Summaries are reviewed and committed to Git manually; large logs and plans stay local with no automatic expiration.

A development-only HTTP API exposes Runs, progress, Summaries, Artifacts, comparison compatibility, historical trend series, and the selected Benchmark Baseline, and allows selecting a new Baseline. Existing T13 and T14 results are imported as separate Imported Benchmark Runs so the history starts populated.

## User Stories

1. As a PayLab developer, I want one command to run the complete Benchmark Suite, so that published results always represent all benchmarks known by that source revision.
2. As a PayLab developer, I want benchmark execution to be explicit, so that a long, destructive workload never starts from application boot, an HTTP request, a push, or a schedule.
3. As a PayLab developer, I want the command to reject a dirty or untracked-file worktree, so that every Run is attributable to an exact committed revision.
4. As a PayLab developer, I want gitignored local Artifact files to not count as a dirty worktree, so that retained evidence does not block the next Run.
5. As a PayLab developer, I want an optional intent note on a Run, so that I can recognize why an old measurement was produced.
6. As a PayLab developer, I want branch, commit, timestamps, environment, dataset, suite, and scenario configuration captured automatically, so that evidence retains its provenance.
7. As a PayLab developer, I want the command to use only a database whose name visibly identifies it as a benchmark database, so that development or test data cannot be reset accidentally.
8. As a PayLab developer, I want the benchmark database restored to a deterministic state before execution, so that Runs begin from comparable data.
9. As a PayLab developer, I want data-mutating scenario groups isolated by deterministic restoration, so that an earlier scenario cannot bias a later one.
10. As a PayLab developer, I want environment, Docker, PostgreSQL, migration, template, dataset, and invariant preflight checks, so that invalid measurements fail before being presented as evidence.
11. As a PayLab developer, I want only one Benchmark Run active at a time, so that competing workloads cannot corrupt results.
12. As a PayLab developer, I want a second invocation to report the active Run and its current stage, so that accidental concurrency is understandable.
13. As a PayLab developer, I want an abandoned active Run recovered as `INCOMPLETE`, so that interruption never leaves a permanently running record.
14. As a PayLab developer, I want a Run to enter `RUNNING` before the first scenario starts, so that clients can observe progress.
15. As a PayLab developer, I want progress to identify completed, active, pending, and failed scenarios, so that I can locate slow or blocked work.
16. As a PayLab developer, I want logs to be readable while the suite runs, so that I can diagnose progress without the terminal.
17. As a PayLab developer, I want a successful full suite to produce a `COMPLETED` Run, so that it is eligible for comparison and Baseline selection.
18. As a PayLab developer, I want a failed or interrupted suite to produce an `INCOMPLETE` Run, so that the failure remains discoverable.
19. As a PayLab developer, I want a correctness or invariant violation to make the Run `INCOMPLETE` even when samples exist, so that invalid measurements never look valid.
20. As a PayLab developer, I want completed measurements from an incomplete execution retained, so that useful diagnostic evidence is not discarded.
21. As a PayLab developer, I want incomplete Runs excluded from comparisons and Baseline selection, so that partial evidence never becomes a reference.
22. As a PayLab developer, I want failure details (scenario, command, timestamps, duration, exit status, summary, full sanitized log), so that I can determine why a Run failed.
23. As a PayLab developer, I want connection strings, credentials, and sensitive environment values removed from stored and served logs, so that diagnostic visibility does not leak secrets.
24. As a PayLab developer, I want Artifacts retained locally without automatic expiration, so that old failures and plans stay available until I remove them.
25. As a PayLab developer, I want Summaries to remain valid when a local Artifact is missing, so that durable history does not depend on one filesystem forever.
26. As a PayLab developer, I want small normalized Summaries written to a versioned location, so that history follows the repository.
27. As a PayLab developer, I want large logs and query plans excluded from Git, so that history does not cause uncontrolled repository growth.
28. As a PayLab developer, I want the executor to never commit automatically, so that I can review generated evidence first.
29. As a PayLab developer, I want the command to report generated files and suggest a commit message, so that publishing a reviewed Summary is straightforward.
30. As a PayLab developer, I want a new Run blocked while a generated Summary or Baseline change remains uncommitted, so that every Run starts from a clean revision.
31. As a PayLab developer, I want T13 and T14 results imported as separate Imported Benchmark Runs, so that existing performance work is preserved and no combined execution is invented.
32. As a PayLab developer, I want imported Runs clearly labeled, so that historical reconstruction is never confused with native output.
33. As a PayLab developer, I want missing legacy values to stay absent, so that import never invents measurements.
34. As a PayLab developer, I want repeated imports to be idempotent, so that re-running the importer never duplicates history.
35. As a PayLab developer, I want the current T13 read protocol preserved (one warm-up, seven measured executions, median), so that query latency keeps its meaning.
36. As a PayLab developer, I want the current T14 load protocol preserved (two-second warm-up, ten-second window, three repetitions, median and range, Latin-square order), so that concurrency results keep their meaning.
37. As a PayLab developer, I want percentiles calculated from measured request samples, so that p50, p95, and p99 keep their current meaning.
38. As a PayLab developer, I want every scenario to declare warm-up, duration, repetitions, and aggregation, so that future protocols evolve explicitly.
39. As a PayLab developer, I want new scenarios that follow the contract to appear automatically in Summaries and API responses, so that adding a benchmark needs no bespoke endpoint.
40. As a PayLab developer, I want every scenario to carry a stable identity and definition fingerprint, so that changed workloads are never compared as if identical.
41. As a PayLab developer, I want every metric to declare key, label, unit, desirable direction, and value, so that clients interpret it without guessing.
42. As a PayLab developer, I want an explicit summary role on metrics meant for overview highlights, so that clients never guess headline measurements from names or ordering.
43. As a PayLab developer, I want T13 query latency and plan evidence available, so that read and index behavior stays observable.
44. As a PayLab developer, I want T14 TPS, debit/credit TPS, p50/p95/p99, retries, serialization failures, version conflicts, deadlocks, exhausted operations, failed payments, lock acquisition, lock waiters, rollbacks, and sample counts available, so that concurrency behavior stays explainable.
45. As a PayLab developer, I want a paginated list of Runs with status, provenance, and headline metrics, so that history is browsable.
46. As a PayLab developer, I want a Run detail with full provenance, protocol, scenarios, metrics, progress, and Artifact references, so that nothing is lost.
47. As a PayLab developer, I want to read and download complete sanitized Artifacts through the API, with bounded inline reads, so that a client can support diagnosis without arbitrary filesystem access.
48. As a PayLab developer, I want the API to identify the default comparison pair (newest completed Run and its previous compatible Run), so that clients agree on the default.
49. As a PayLab developer, I want comparison compatibility reported per scenario as comparable, new, removed, changed, or environment-incompatible, so that clients never coerce values into misleading deltas.
50. As a PayLab developer, I want machine, PostgreSQL, dataset, or critical configuration incompatibility to block affected scenarios, so that environmental change never masquerades as regression.
51. As a PayLab developer, I want direction-aware metric semantics and the five-percent stable tolerance defined once in a shared pure contract, so that the delta rules are unambiguous and testable.
52. As a PayLab developer, I want a trend series per scenario and metric limited to completed compatible measurements, so that a line represents comparable evidence.
53. As a PayLab developer, I want incomplete Runs listed on the timeline without metric values, so that operational failures stay part of history.
54. As a PayLab developer, I want one deliberate Benchmark Baseline per compatible lineage, stored as a small versioned reference, so that long-term performance has a stable anchor.
55. As a PayLab developer, I want to select a Baseline through the API from a completed native or imported Run, so that reference management is deliberate and convenient.
56. As a PayLab developer, I want Baseline selection to leave Run Summaries untouched and the change uncommitted, so that Runs stay immutable and changes stay reviewable.
57. As a PayLab developer, I want Baseline selection to reject running, incomplete, and missing Runs, so that a partial Run is never a reference.
58. As a PayLab developer, I want the response to disclose the pending Git change, so that clients can warn the developer.
59. As a PayLab developer, I want the benchmark capability disabled by default outside development, so that logs and local control operations are not exposed remotely.
60. As a PayLab developer, I want a disabled capability to be absent or refused honestly, so that clients can show an unavailable state rather than a loading error.
61. As a PayLab developer, I want starting a Run to be impossible over HTTP, so that the API cannot trigger a long destructive workload.
62. As a PayLab developer, I want a malformed Summary to be isolated, so that one bad file never breaks the whole history.
63. As a PayLab developer, I want benchmark read endpoints to work without a benchmark database and outside financial authentication, so that they are a local developer surface independent of financial state.
64. As a PayLab developer, I want the OpenAPI document to describe every benchmark endpoint, so that the console client is generated from the contract.
65. As a PayLab developer, I want automated tests at the command and HTTP boundaries, so that the workflow stays reliable while internals evolve.

## Implementation Decisions

- Benchmark observability lives in the API as its own bounded area. It does not join the financial domain, reuses no financial repositories, and never becomes financial source-of-truth data.
- The canonical executor is an explicit package command that always runs the complete Benchmark Suite known by its clean source revision. It accepts an optional intent note and has no scenario-selection option.
- The executor refuses tracked or untracked worktree changes. Gitignored Artifact files are excluded from that check.
- Starting a Run is terminal-only; no HTTP route starts, cancels, or pauses a Run.
- An exclusive local lock guards execution. A concurrent invocation exits unsuccessfully and reports the active Run.
- The destructive-name safeguard of the dedicated benchmark database is retained. Preflight and reset never target the development or test databases; the benchmark URL is separate from the application `DATABASE_URL`.
- Every execution validates prerequisites and restores deterministic data before the suite. Mutating scenario groups receive isolated restored state.
- Existing T13 reads and T14 concurrency experiments become registered scenario groups behind a scenario registry. Existing invariant and correctness checks are gates; a violation makes the Run incomplete.
- Protocols belong to scenario definitions. T13 and T14 keep their accepted warm-up, window, repetition, and aggregation semantics.
- Scenario definitions have stable IDs and fingerprints covering workload and measurement semantics that affect comparability.
- Metrics use a generic normalized contract: stable key, label, numeric value, unit, desirable direction, aggregation context, and optional explicit summary role. Scenario-specific configuration stays on the scenario, not in metric names.
- A Run captures source revision, branch, optional note, timestamps, durations, executor and schema versions, environment fingerprint, database configuration, dataset fingerprint, suite membership, scenario definitions, progress, outcome, and Artifact references.
- Run Status is `RUNNING`, `COMPLETED`, or `INCOMPLETE`. Terminal states are immutable; startup recovery converts an abandoned `RUNNING` Run to `INCOMPLETE` with interruption evidence.
- Summaries are deterministic, reviewable, version-controlled JSON with an explicit schema version; unknown future versions are rejected safely. Generated Summaries are never committed automatically.
- Artifacts are stored outside Git, organized by Run, sanitized before storage and again before exposure, and never expire automatically.
- Sanitization is allowlist-oriented for environment metadata and redacts database URLs, credentials, secrets, and configured sensitive patterns from process output.
- The importer reconstructs T13 and T14 as separate Imported Benchmark Runs from structured raw sources where they exist. Provenance is explicit, unavailable fields stay absent, and repeated imports are idempotent.
- A versioned Baseline reference points to a completed Run without mutating it. Selection is a development-only API write; the API never commits it.
- Benchmark capability is off by default outside development, controlled by validated environment configuration, and reflected in the OpenAPI/runtime behavior so clients can derive availability honestly.
- API reads own safe discovery, validation, path containment, pagination, bounded inline reads, and streaming of Artifacts. Clients never supply filesystem paths.
- The API reports comparison compatibility (environment and per-scenario), the default comparison pair, and trend series. The pure contract defines metric direction, absolute and percentage delta, and the five-percent stable boundary so that clients and tests share one definition; the console renders the deltas.
- Endpoints are bounded: paginated history, capped inline log reads, streamed downloads.
- The storage and exposure boundary is recorded in ADR 0011.

## Testing Decisions

- Good tests assert observable behavior and durable contracts (process outcome, files produced, HTTP responses), not internal calls or process-wrapper details.
- Primary seam 1 — executor process boundary: an integration test invokes the command in a temporary clean Git repository with a temporary Artifact root and controlled fake scenario processes. It covers clean-tree enforcement, note capture, exclusive locking, lifecycle and progress, successful publication, incomplete recovery, sanitization, generated-file report, and no automatic commit. Prior art: the existing Testcontainers integration setup and the demo-seed integration tests.
- Primary seam 2 — HTTP boundary: API e2e tests with real Summary and Artifact fixtures cover capability on/off, list/detail/progress, pagination, imported and incomplete Runs, Artifact read/download, path traversal rejection, redaction, malformed-record isolation, compatibility, trends, and Baseline writes. Prior art: the existing e2e application harness and the OpenAPI contract e2e.
- Seam 3 — pure contract: unit tests for Summary validation, deterministic serialization, fingerprints, compatibility, metric direction, deltas, and the exact ±5% boundary. No filesystem, database, or HTTP.
- Database correctness seam: the existing small deterministic dataset and invariant tests remain; additional integration coverage verifies reset isolation on a small dataset, never the full million-payment dataset.
- Importer fixture tests pin representative real T13/T14 values, absent values, imported provenance, and idempotence.
- The full T13/T14 workload is a documented manual validation; automation uses reduced matrices and durations while the production scenario definition stays unweakened.
- Validation gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, OpenAPI regeneration, and one documented manual full Run.

## Out of Scope

- Anything in `paylab-ui`: navigation, overview, run detail, comparison and trend rendering, Baseline confirmation, polling, and browser smoke tests.
- Scheduled, push-triggered, CI-hosted, or remote execution; starting, cancelling, or partially selecting a suite over HTTP; a single-scenario canonical command.
- Publishing from a dirty worktree; automatic commits, pushes, tags, or pull requests.
- Automatic Artifact deletion or expiry; storing large logs or plans in Git; deleting Runs or Artifacts through the API.
- Treating imported data as complete when the source did not record a measurement.
- Comparing incomplete, changed, or environment-incompatible measurements by coercing values.
- Statistical significance modeling, alerts, budgets, SLOs, or build failure from a regression.
- WebSockets or server-sent events; remote or production exposure of benchmark data or Baseline mutation.
- Replacing the benchmark database, experiment documents, or correctness checks with a third-party platform.

## Further Notes

- The approved execution environment is the developer's local machine; environment fingerprints still matter because hardware, PostgreSQL version and settings, Node version, dataset, or Docker configuration may change.
- T13 evidence is mostly query timing, plans, dataset, and index design; T14 evidence is structured JSONL load data plus correctness and summary documents. The importer must respect those differences.
- The five-percent tolerance is a presentation rule, not statistical significance.
- Domain terms (Benchmark Run, Run Status, Suite, Summary, Baseline, Comparison, Comparable Benchmark Scenario, Performance Change, Incomplete and Imported Benchmark Run, Benchmark Artifact) are defined in the project `CONTEXT.md` files.
- Task IDs for this feature use the `B` prefix to avoid colliding with the completed September tasks T1–T18.
