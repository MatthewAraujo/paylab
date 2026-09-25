# PRD — Benchmark Observability (Operational Console)

Scope: the `paylab-ui` side of benchmark observability. The backend contract is delivered and documented in `../../../paylab-api/docs/benchmark.md` (routes under `/v1/benchmarks`); the cross-project draft is `../../../docs/PRD.md`. The visual direction is the reviewed design in `../BENCHMARKS-DESIGN-BRIEF.md` and `../BENCHMARKS-DESIGN-REVIEW.md`, whose reference prototype is `PayLab-Benchmarks-source/` (read-only, never imported by production code).

## Problem Statement

The PayLab API now records, compares, and serves benchmark evidence (Runs, progress, Artifacts, comparison compatibility, trends, and a Baseline), but the Operational Console shows none of it. A developer must call the API by hand or read JSON files to learn whether the latest Run is running, complete, or incomplete, whether performance improved, stayed stable, or regressed, why a comparison is invalid, or what a failed scenario logged. Two Runs cannot be compared, a metric's history cannot be inspected, and the Baseline cannot be chosen without a raw HTTP call.

The developer runs benchmarks from the terminal on one local machine. They need the console to observe that work honestly (never start it), present the measurements with the conditions that produced them, and refuse to draw conclusions the evidence does not support.

## Solution

Add a **Benchmarks** area to the Operational Console, separate from the financial views, built on the existing shell and visual system and driven entirely by the generated API contract.

- An **overview** of the latest Benchmark Run: status, provenance, declared headline measurements with their scenario context, difference from the previous compatible Run and the Baseline, notable changes, scenario groups, recent history, and an entry to trends. While a Run is active it shows progress and recent log output, refreshed by bounded polling.
- A **Run detail** with complete provenance, environment, dataset, protocol, every scenario and normalized metric, the failure evidence and diagnostic measurements of an Incomplete Run, the separate Imported T13 and T14 records, and the Benchmark Artifacts with a safe plain-text viewer.
- A **Comparison** of any two eligible Runs (previous compatible by default, or the Baseline or another Run), per scenario, with raw values, absolute and percentage deltas, direction-aware classification within a 5% tolerance, and explicit compatibility states.
- A **Baseline** action with confirmation that discloses the reviewable Git change, and a pending-change notice after success.
- **Historical trends** for one scenario metric across compatible completed Runs, with exact values beside the chart.

When the API's benchmark capability is off (anything but local development) the area shows an honest "available only in local development" state.

## User Stories

1. As a PayLab developer, I want a Benchmarks item in the primary navigation, so that performance evidence is one click away and separate from financial activity.
2. As a PayLab developer, I want the existing desktop sidebar and mobile navigation sheet to include Benchmarks, so that the area feels like part of the same console.
3. As a PayLab developer, I want Benchmarks to be marked as the current section on every benchmark route, so that I always know where I am.
4. As a PayLab developer, I want the console to say plainly that Benchmarks are available only in local development when the API disables them, so that a missing area is never mistaken for a loading error.
5. As a PayLab developer, I want an unreachable API to be reported differently from a disabled capability, so that I know whether to start the API or to accept that it is local-only.
6. As a PayLab developer, I want the unavailable state to avoid suggesting that production configuration be changed casually, so that a local diagnostic surface stays local.
7. As a PayLab developer, I want no control anywhere that starts, cancels, pauses, schedules, or narrows a benchmark, so that a long destructive workload can only be started deliberately from the terminal.
8. As a PayLab developer, I want a short note that Runs are started from the terminal, so that I know where to go.
9. As a PayLab developer, I want the overview to show the latest Run with its status, exact start time, duration, abbreviated commit, branch, and note, so that I can identify what I am looking at.
10. As a PayLab developer, I want to reveal the full commit hash and Run id and copy them, so that long identifiers stay compact without becoming unusable.
11. As a PayLab developer, I want native and Imported provenance labelled, so that historical reconstruction is never mistaken for executor output.
12. As a PayLab developer, I want the current Baseline identity on the overview, so that I know the long-term reference.
13. As a PayLab developer, I want headline measurements to come only from what the Run declares with a summary role, so that the console never guesses which number matters.
14. As a PayLab developer, I want each headline card to name its scenario and strategy context, so that one scenario's throughput is never read as a universal application value.
15. As a PayLab developer, I want to choose which scenario's declared highlights are shown, with a deterministic default, so that a Run with many scenarios stays usable without hiding the choice.
16. As a PayLab developer, I want a calm "no headline measurement declared" state, so that a Run without highlights is not given an implicit one.
17. As a PayLab developer, I want throughput, latency, and the suite duration shown with units and precision that match the source, so that values are exact and comparable at a glance.
18. As a PayLab developer, I want the difference from the previous compatible Run shown by default, so that the effect of the latest change is immediately visible.
19. As a PayLab developer, I want a compact indication of the difference from the Baseline, so that short-term and long-term change are distinct.
20. As a PayLab developer, I want notable improvements and regressions beyond the 5% tolerance listed, so that I can find what moved.
21. As a PayLab developer, I want scenario groups summarized (for example reads and index behavior versus concurrency and load), so that I can move from overall status to the relevant family.
22. As a PayLab developer, I want recent Runs listed with status, provenance, and headline values, so that I can reach older evidence.
23. As a PayLab developer, I want entries from the overview to comparison, Run detail, and trends, so that analysis continues without retyping ids.
24. As a PayLab developer, I want no composite performance score, so that conclusions stay tied to real measurements.
25. As a PayLab developer, I want an active Run to show `RUNNING`, its scenario counts, the current scenario, elapsed time, and overall progress, so that I can follow a command started in the terminal.
26. As a PayLab developer, I want the progress to refresh automatically without clearing what is already on screen, so that updates are not disruptive.
27. As a PayLab developer, I want the time of the last successful refresh and the polling status shown, so that I know how fresh the page is and never mistake polling for a live stream.
28. As a PayLab developer, I want the most recent sanitized log output of the running scenario, so that I can diagnose progress without switching to the terminal.
29. As a PayLab developer, I want polling to stop when the Run reaches a terminal state or is reported abandoned, so that the page does not poll forever.
30. As a PayLab developer, I want an abandoned `RUNNING` record explained, so that a dead process is not shown as active work.
31. As a PayLab developer, I want assistive technology announcements to stay restrained during progress, so that frequent updates do not flood a screen reader.
32. As a PayLab developer, I want distinct initial-loading, empty-history, API-error-with-retry, background-refresh-failure, and capability-unavailable states, so that each situation is explained truthfully.
33. As a PayLab developer, I want a refresh failure to keep the previously loaded evidence visible and say so, so that a blip does not blank the page.
34. As a PayLab developer, I want unreadable records the API isolated to be reported without hiding the rest of the history, so that one bad file does not look like a failed suite.
35. As a PayLab developer, I want a Run detail with identity, timing, environment, dataset, and suite provenance, so that I can judge whether a result is trustworthy.
36. As a PayLab developer, I want protocols (warm-up, window, repetitions, aggregation) shown with their scenarios, so that I know how each number was produced.
37. As a PayLab developer, I want every scenario and every normalized metric available with label, unit, direction, aggregation, and dimensions, so that no recorded evidence is lost to the overview.
38. As a PayLab developer, I want unknown future metrics to render usefully from their label, unit, direction, and value, so that adding a benchmark needs no bespoke page.
39. As a PayLab developer, I want metrics carrying a dimension such as a strategy grouped and labelled by it, so that one scenario's five strategies stay distinguishable.
40. As a PayLab developer, I want missing values shown as not recorded and never as zero, so that absence is not mistaken for a measurement.
41. As a PayLab developer, I want large metric tables grouped by scenario and expandable, so that a full concurrency Run stays readable and fast.
42. As a PayLab developer, I want shortcuts from a Run to its comparison with the previous Run and the Baseline, so that the next question is one click away.
43. As a PayLab developer, I want an Incomplete Run to show its failure first (scenario, command, exit status or interruption, times, summary), so that I can see why it stopped.
44. As a PayLab developer, I want the measurements completed before the failure shown in a visibly separate "diagnostic only" section, so that useful evidence is kept but never mistaken for comparable evidence.
45. As a PayLab developer, I want the Incomplete Run to state that it cannot be compared or become the Baseline, so that its exclusion is understood.
46. As a PayLab developer, I want no overall performance classification on an Incomplete Run, so that partial evidence is not judged.
47. As a PayLab developer, I want the Imported T13 baseline, T13 adopted, and T14 Runs shown as separate records with their own provenance, protocol, evidence, and absent fields, so that no combined historical run is implied.
48. As a PayLab developer, I want an Imported Run to explain that it predates the canonical executor and that some facts were not recorded, so that its limits are clear.
49. As a PayLab developer, I want Imported Runs to be eligible for comparison and Baseline only when actually compatible and completed, so that eligibility follows the evidence rather than the origin.
50. As a PayLab developer, I want each Run's Artifacts listed with kind, label, scenario, size, and whether the local file exists, so that I can find diagnostic evidence.
51. As a PayLab developer, I want a missing local file reported as not available on this machine, so that absence is explained rather than reported as an error.
52. As a PayLab developer, I want to open an Artifact as sanitized plain text, so that I can read logs and query plans in the browser.
53. As a PayLab developer, I want large Artifacts loaded in bounded chunks with a deliberate way to read more, so that a huge log never freezes the page.
54. As a PayLab developer, I want line wrapping to be switchable, so that long lines and plans stay readable.
55. As a PayLab developer, I want to copy the loaded text and download the complete file, so that I can share or archive evidence.
56. As a PayLab developer, I want Artifact content rendered strictly as text, so that nothing in a log can execute.
57. As a PayLab developer, I want loading, fetch-error, and missing-file states inside the Artifact viewer, so that each is explained where it happens.
58. As a PayLab developer, I want a note that Artifacts are retained locally and may be absent elsewhere, so that I do not expect them on another machine.
59. As a PayLab developer, I want to compare two Runs with the reference defaulting to the previous compatible Run, so that I see the latest change without choosing.
60. As a PayLab developer, I want to switch the reference to the Baseline or to any other eligible Run, so that I can examine a specific revision.
61. As a PayLab developer, I want to swap the two Runs, so that I can look at the comparison from the other side.
62. As a PayLab developer, I want the chosen Runs kept in the address, so that a comparison can be reloaded, shared, and navigated with the browser buttons.
63. As a PayLab developer, I want only completed Runs offered for comparison and an explanation for those that are not, so that partial evidence never enters a comparison.
64. As a PayLab developer, I want environment and dataset compatibility stated up front, so that I know whether numbers may be compared at all.
65. As a PayLab developer, I want every scenario labelled comparable, new, removed, changed definition, environment-incompatible, or dataset-incompatible, so that suite evolution is understandable.
66. As a PayLab developer, I want no numeric delta for a scenario that is not comparable, with the reason, so that a misleading number is never shown.
67. As a PayLab developer, I want each comparable metric to show current value, reference value, absolute delta, percentage delta, and a classification, so that a label is always backed by numbers.
68. As a PayLab developer, I want Improved, Stable, and Regressed to follow each metric's direction, so that a negative delta on latency reads as better.
69. As a PayLab developer, I want a change within −5% and +5% inclusive to be Stable, and the raw values still visible, so that ordinary noise is not highlighted and evidence is not hidden.
70. As a PayLab developer, I want informational metrics such as sample counts shown but never classified, so that they are not read as better or worse.
71. As a PayLab developer, I want a zero reference to omit the percentage, treat 0 to 0 as Stable, and classify a change away from zero by direction, so that deadlocks going from 0 to 3 are flagged.
72. As a PayLab developer, I want a metric present on only one side labelled not recorded rather than compared, so that a missing value is not read as zero.
73. As a PayLab developer, I want separate summary counts for Improved, Stable, Regressed, Incompatible, and Not recorded, so that the health of the evidence is not blurred.
74. As a PayLab developer, I want a one-line explanation that the 5% band is a presentation tolerance and not statistical significance, so that no false certainty is implied.
75. As a PayLab developer, I want wide comparison tables to scroll within a labelled, keyboard-focusable region with scenario and metric identity kept visible, so that small screens stay usable.
76. As a PayLab developer, I want to set a completed Run as the Baseline from its detail and from a comparison, so that reference management is convenient and deliberate.
77. As a PayLab developer, I want a confirmation that names the current and the proposed Baseline, so that I cannot change the reference by accident.
78. As a PayLab developer, I want the confirmation to explain that the change appears as a reviewable Git change and that nothing is committed, so that I know what to do next.
79. As a PayLab developer, I want success to show the new Baseline and a pending-change notice with the uncommitted files, so that I know the next benchmark Run is blocked until I commit.
80. As a PayLab developer, I want a failed selection to keep the previous Baseline and say why, so that a failure never leaves me unsure of the reference.
81. As a PayLab developer, I want the action absent or disabled with an explanation for running, incomplete, and missing Runs, so that ineligible Runs cannot be chosen.
82. As a PayLab developer, I want selecting the current Baseline again to be reported as no change, so that nothing appears to have been written when it was not.
83. As a PayLab developer, I want to choose a scenario and metric and see its history across compatible completed Runs, so that gradual change is visible beyond two Runs.
84. As a PayLab developer, I want the unit and desirable direction of the metric stated, so that a rising line is read correctly.
85. As a PayLab developer, I want the Baseline marked on the trend when it is one of the points, so that long-term deviation is easy to see.
86. As a PayLab developer, I want Incomplete Runs shown as markers with no value, and Runs left out (changed definition, other environment or dataset, metric not recorded) listed with the reason, so that history stays honest.
87. As a PayLab developer, I want the line never to join points across a change, so that it never implies a continuity that does not exist.
88. As a PayLab developer, I want an exact-value table under every chart with run, value, commit, time, and note, so that no value depends on a pointer or on color.
89. As a PayLab developer, I want trends to work with one point, no points, dense history, and Imported points, so that edge cases are handled.
90. As a PayLab developer, I want the selected scenario, metric, and dimension kept in the address, so that a trend can be reloaded and shared.
91. As a PayLab developer, I want status, classification, compatibility, and provenance conveyed by text and shape as well as color, so that meaning never depends on color alone.
92. As a PayLab developer, I want every route, selector, disclosure, dialog, log, and download to work with the keyboard and keep visible focus, so that the area is accessible.
93. As a PayLab developer, I want secondary text at the console's readable baseline, and layouts that hold at 200% zoom and at 390, 1024, and 1440 pixel widths, so that dense evidence stays legible.
94. As a PayLab developer, I want motion to respect reduced-motion preferences, so that the interface is comfortable.
95. As a PayLab developer, I want copy in concise technical English using the canonical terms, so that language matches the rest of PayLab.
96. As a PayLab developer, I want tests that exercise routes, components, and the numeric rules through observable behavior, so that the area stays reliable while internals change.

## Implementation Decisions

- **Contract source.** The console uses only the generated OpenAPI types of the API's benchmark routes. The contract snapshot is refreshed from a running local API before feature work, and no benchmark shape is handwritten. Availability of the area is derived from the snapshot (the routes are described with typed JSON responses) and confirmed at runtime by the API's answer.
- **Where the data is read.** The benchmark surface is local, unauthenticated, and not financial. It is read from the browser through TanStack Query against the configured API base URL (the same precedent as System Health), with a small typed client that carries no credential. The server-only Merchant key is never sent to benchmark routes and financial data handling is unchanged. Server Components render the route frames and metadata; interactive feature components own the queries. This is what makes bounded polling, Artifact chunks, and the Baseline write possible without a proxy.
- **Failure taxonomy.** Every benchmark read resolves to one of: data, capability unavailable (the API answered 404 on the benchmark surface), API unreachable or malformed answer, not found (unknown Run or Artifact), unavailable local Artifact file, and validation or ineligible-candidate refusals. Each maps to a first-class, honest state. No mock mode and no silent fallback exist.
- **Routes.** Overview, Comparison, Trends, and Run detail are real routes navigated with links (current page marked with `aria-current`), not an in-page tab widget. Selections that define a view (compared Runs, trend scenario, metric, and dimension, overview scenario) live in the query string, so views are reloadable and shareable.
- **Overview headline rule.** Headline measurements come only from metrics declared with a summary role. The overview shows the declared highlights of one scenario at a time, defaulting to the first scenario, in the Run's own order, that declares any, with a selector for the others and the scenario context always visible. Roles the Run does not declare (currently error rate) render as "not declared", never as a guess. The suite duration comes from the Run itself.
- **Numeric rules live in a pure, tested module** independent of React: change classification (higher is better, lower is better, neutral), the inclusive 5% Stable band with floating-point tolerance, raw absolute and percentage deltas, zero-reference handling (no percentage; 0 to 0 is Stable; a change away from zero is classified by direction), missing values as not recorded, informational metrics unclassified, metric identity by key plus dimensions, comparison summary counts, unit and precision formatting, duration and timestamp formatting in one display timezone with the exact value available, and identifier compaction. The reference-zero rule follows the approved design; the API's pure `classifyChange` (used by no endpoint) treats it as not comparable, and that divergence is recorded for a later alignment.
- **Comparison data.** Compatibility per scenario comes from the API's comparison routes; values come from the two Run records; the console computes deltas and classifications. Only completed Runs are selectable. Scenario groups load expanded on demand so a full concurrency Run (about 1,800 metrics) stays fast, while summary counts cover all comparable metrics.
- **Polling.** An active Run is followed through its progress route on a bounded interval only while the Run is running and its owner is alive, keeping the last data visible during refresh and stopping on a terminal or abandoned state. The recent log is the tail of the active scenario's log Artifact. Nothing streams (no WebSocket or server-sent events).
- **Artifacts.** Text is fetched in bounded chunks with the API's offsets and rendered strictly as escaped text with a wrap toggle, copy of the loaded text, and download through the API's download route. Missing files, loading, and fetch failures are states of the viewer.
- **Baseline.** Selection is a confirmed mutation that shows the current and the proposed Baseline and discloses the Git effect. On success it shows the new Baseline and the pending uncommitted files reported by the API; on failure the previous Baseline stays displayed. The action exists only for completed Runs.
- **Visual system.** The existing shell, tokens, typography, radii, and Badge/Card vocabulary are reused; the prototype's static shell, preview banner, state simulator, hard-coded data, and web fonts are not reproduced. Benchmark semantics extend the shared Badge variants and add small reusable pieces (Run status, provenance, change and compatibility badges, a monospace metric value, copyable identifiers, a plain-text viewer) only where a second screen needs them. Trend geometry is drawn with accessible SVG and HTML primitives without a charting dependency. Secondary text uses the console's `text-xs` baseline.
- **Dialogs.** The Baseline confirmation and the Artifact viewer use the existing Radix dialog dependency through local shadcn-style components, with focus restored on close.

## Testing Decisions

- A good test drives the interface through what a user can observe (rendered text, roles, links, requests made) and not through component structure, hook internals, or query-cache details. Controlled HTTP responses are supplied at the network boundary; there is no production mock mode.
- **Highest seam: rendered route and feature tests** with a typed fixture builder (derived from the generated schema) and a request-routing fetch stub. They cover capability unavailable, unreachable API, loading, empty, error with retry, refresh failure with preserved data, malformed-record notice, the completed, running, incomplete, and imported overview and detail states, polling start and stop and the freshness indication, Artifact viewer states, comparison selection and every compatibility state, the Baseline flow including failure that preserves the previous Baseline, and trends including one point and no points.
- **Pure unit tests** pin the numeric rules with independent literals: exactly ±5% is Stable, direction by metric, informational metrics unclassified, zero reference cases, missing values, summary counts, formatting, and metric identity. They reuse the boundary cases the API's tests pin, so both sides share one definition.
- **Component tests** cover the trend chart and its exact-value table, the plain-text viewer (escaping, wrapping, chunk loading), badges and non-color cues, and keyboard and focus behavior of the dialogs.
- **Browser smoke test** (Playwright, request interception with typed fixtures for determinism) covers navigation to Benchmarks, latest Run rendering, comparison selection, Run detail, and a configured local API. A manual check against a real local API with the imported evidence is documented.
- Prior art: the existing System Health, Accounts, Payments, and Dashboard route and component tests, the capability tests, and the Playwright navigation smoke test.
- Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, plus contract refresh with `pnpm sync:api`.

## Out of Scope

- Starting, cancelling, pausing, scheduling, or narrowing a benchmark Run from the console; any "run now" affordance.
- Backend changes (the read API and the Baseline write are delivered); assigning the missing error-rate and duration summary roles on the API side.
- Compacting the versioned Summary format, statistical significance, alerts, budgets, and automatic quality gates.
- Automatic Git commits or pushes; deleting Runs or Artifacts; editing any Summary.
- WebSocket or server-sent-event streaming; server-side proxying of benchmark reads; a charting library.
- A global change of the console's typography or web fonts; redesign of the financial views.
- Reproducing the prototype's static shell, preview or design-notes controls, or illustrative data in production code.
- Remote or production exposure of benchmarks.

## Further Notes

- The design review's list of contract corrections is already satisfied by the API: declared summary roles, separate Imported T13 and T14 Runs (with T13 in two schema states), failed and interrupted Runs that keep their completed measurements, and per-scenario compatibility. The console must still present them as the review requires (diagnostic-only section, separate imported records, distinct Incompatible and Not recorded counts).
- **Decisions to confirm** (defaults stated above): reading benchmarks directly from the browser instead of through the Next server; which scenario the overview features by default; following the design's zero-reference rule rather than the API function's; leaving error rate as "not declared" until the API declares a role.
- Real data shapes to design for: a full T14 Run has 17 scenarios and about 1,800 metrics (five strategies per concurrency cell, strategy as a metric dimension); T13 has 33 single-metric latency scenarios; imported Runs have no finish time, unknown commit and branch, and only the medians the sources recorded; headline roles exist only on the production strategy's throughput and p99.
- Next.js 16 differs from earlier majors; the console's `AGENTS.md` requires reading the bundled guides in `node_modules/next/dist/docs/` before touching routing, params, or search params.
- Domain terms are defined in `../../CONTEXT.md` and `../../../paylab-api/CONTEXT.md`. Task ids for this feature use the `F` prefix to avoid colliding with the completed console MVP tasks.
