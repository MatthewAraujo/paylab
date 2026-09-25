# PayLab Benchmark Observability — Design Brief

## Purpose

Design the **Benchmarks** area of the PayLab Operational Console. This area turns locally produced backend performance evidence into a clear operational history without hiding the conditions under which the measurements were produced.

The design should help a developer answer:

- Is a Benchmark Run active, completed, or incomplete?
- Did performance improve, remain stable, or regress?
- How does the latest Run compare with the previous compatible Run?
- How does it compare with the selected Benchmark Baseline?
- Which scenario and metric caused a notable change?
- Is a comparison invalid because the workload or environment changed?
- How has one metric evolved across compatible Runs?
- If execution failed, which step failed and what do the logs say?

The UI language is **English**. This brief supplements the general [PayLab Operational Console design brief](DESIGN-BRIEF.md); reuse that shell and visual system rather than designing a separate product.

## Product context

PayLab is an engineering laboratory for payment processing and double-entry ledger behavior. Benchmarks run manually on the developer's approved local machine through one terminal command. The command always executes the complete Benchmark Suite known by a clean Git revision.

The Operational Console does not start, cancel, pause, or configure benchmark execution. It observes progress, presents evidence, supports comparisons and trends, exposes sanitized diagnostic Artifacts, and lets the developer select a Benchmark Baseline.

Benchmark capability is local-development-only. In other environments, the UI must show an honest unavailable state and must not imply that logs can be fetched.

## Canonical language

Use these terms exactly:

- **Benchmark Run** — one immutable execution from a clean source revision.
- **Benchmark Suite** — the complete set of scenarios known by that revision.
- **Benchmark Summary** — the normalized, durable measurements and provenance of a Run.
- **Benchmark Artifact** — sanitized diagnostic evidence such as logs or query plans.
- **Benchmark Baseline** — a deliberately selected long-term comparison Run.
- **Benchmark Comparison** — a comparison between eligible Runs.
- **Comparable Benchmark Scenario** — a scenario whose definition and relevant environment are equivalent across Runs.
- **Performance Change** — `Improved`, `Stable`, or `Regressed` after metric direction and the 5% tolerance are applied.
- **Imported Benchmark Run** — historical T13/T14 evidence reconstructed from trustworthy prior results.
- **Incomplete Benchmark Run** — a Run that did not finish the complete suite.

Avoid vague labels such as “report,” “latest metrics,” “test results,” or “performance score” when one of the canonical terms is intended.

## Experience principles

### Evidence before decoration

Every status or visual conclusion must be backed by the measured value, reference value, unit, and delta. Charts support analysis; they do not replace exact values.

### Fast assessment, deep diagnosis

The overview should answer “did it get better or worse?” quickly. Run detail and Artifacts should support exhaustive investigation without forcing all metrics onto the first screen.

### Honest comparability

Do not calculate or visualize a numeric delta when scenarios, datasets, machines, PostgreSQL configurations, or metric semantics are incompatible. Explain why comparison is unavailable.

### Technical, calm, and readable

The area may be data-dense, but it should not imitate a trading terminal, observability vendor dashboard, or neon monitoring wall. Prefer restrained hierarchy, aligned numbers, and deliberate use of emphasis.

### Status is not color

Run status, Performance Change, scenario compatibility, and failure states need text plus icon, shape, or position. Color is supplementary.

## Navigation and routes

Add **Benchmarks** to the primary Operational Console navigation, separate from the financial Dashboard.

The design must cover:

1. `/benchmarks` — latest Run overview, active progress, notable changes, scenario groups, recent history, and trend entry.
2. `/benchmarks/compare` — two-Run comparison with previous, custom, and Baseline references.
3. `/benchmarks/runs/:id` — complete Run provenance, protocols, scenarios, metrics, failures, logs, and query-plan Artifacts.

Do not add a “Run benchmark” button anywhere.

## Required responsive frames

Provide at least:

- desktop: approximately 1440 px wide;
- compact desktop/tablet: approximately 1024 px wide;
- mobile: approximately 390 px wide.

Large metric matrices and logs need explicit small-screen behavior. Horizontal scrolling is acceptable for dense comparison tables when headers and row identity remain understandable. Important values must not disappear solely because the viewport is narrow.

## Screen requirements

### 1. Benchmarks overview — completed latest Run

Purpose: assess the newest evidence quickly and enter deeper analysis.

Required header information:

- page title and concise description;
- latest Run status;
- exact execution timestamp plus optional relative time;
- abbreviated commit with access to the full hash;
- branch;
- optional intent note;
- native or `Imported` provenance;
- current Benchmark Baseline identity;
- clear indication that execution is initiated from the terminal.

Prioritized summary metrics:

- throughput/TPS;
- p99 latency;
- error or failure rate/count, depending on scenario data;
- total suite duration.

These values may come from different scenario groups. The label must identify enough context that a developer cannot mistake one scenario's TPS or p99 for a universal application value.

Required sections:

- overall Run status and provenance;
- comparison against the previous compatible Run by default;
- compact indication of difference from the Benchmark Baseline;
- notable regressions and improvements beyond the 5% tolerance;
- scenario-group summaries for reads/index behavior, concurrency/load behavior, and future generic groups;
- recent Run history;
- entry point to historical trends;
- exact values and links to comparison/detail.

Do not invent a composite performance score.

### 2. Benchmarks overview — active Run

Purpose: observe progress from a command already started in the terminal.

Required information:

- `RUNNING` status;
- Run ID, commit, branch, note, start time, and elapsed time;
- completed, active, pending, and failed scenario counts;
- current scenario and stage;
- overall progress representation;
- most recent sanitized log output;
- last update time;
- calm explanation that the page updates automatically;
- link to the complete Run detail.

The UI polls periodically. Do not design streaming controls, cancellation, pause, retry, scenario selection, or execution configuration.

New progress should not erase already visible content or cause disruptive full-page loading transitions.

### 3. Empty and unavailable overview

Design distinct states for:

- benchmark capability unavailable outside local development;
- capability enabled but no native or imported Runs found;
- API unreachable;
- malformed or unreadable Run isolated while other history remains available;
- initial loading;
- refresh error while previously loaded data remains visible.

The unavailable state should explain that Benchmarks are intentionally local-only. It must not suggest changing production configuration casually.

### 4. Benchmark Comparison

Purpose: understand the difference between one selected Run and a reference Run.

Required controls:

- primary Run selector;
- reference selector defaulted to the previous compatible Run;
- explicit option to use the Benchmark Baseline;
- clear commit, timestamp, note, provenance, and status inside selectors or immediately adjacent context;
- swap Runs when both are eligible;
- link to each Run detail.

Required summary:

- selected Run and reference identities;
- environment/dataset compatibility result;
- count of improved, stable, regressed, new, removed, changed, and incompatible scenarios/metrics;
- concise explanation of the 5% tolerance.

Required per-scenario states:

- comparable with numeric metrics;
- new in the selected Run — no previous measurement;
- removed from the selected Run — shown only in the reference;
- changed definition — incompatible;
- incompatible environment or dataset;
- metric absent in an imported Run;

For each comparable metric show:

- metric label and unit;
- selected value;
- reference value;
- absolute delta;
- percentage delta;
- `Improved`, `Stable`, or `Regressed` classification;
- desirable direction where it is not obvious.

Direction rules:

- higher throughput is favorable;
- lower latency is favorable;
- lower errors, failures, retries, conflicts, deadlocks, exhaustion, lock acquisition, lock waiters, and rollbacks are favorable;
- a change within −5% to +5% is `Stable`;
- a missing value is not zero;
- no percentage should be shown when the reference value makes it mathematically misleading; provide a clear unavailable treatment.

The design may use tables, aligned metric rows, compact bars, or small inline visualizations. Exact values must remain readable and selectable.

### 5. Benchmark Baseline selection

Purpose: select a stable long-term reference without mutating a Benchmark Run.

The action is available only for an eligible `COMPLETED` Run.

Required interaction:

- “Set as Baseline” action from Run detail and/or comparison context;
- confirmation that identifies current and proposed Baselines;
- explanation that the reference change will create a reviewable Git change;
- success feedback with the new Baseline identity;
- visible pending-worktree state after success;
- disabled or unavailable treatment for `RUNNING`, `INCOMPLETE`, missing, or incompatible Runs;
- API error state that preserves the current Baseline.

Do not design automatic commit or push actions.

### 6. Run detail — completed native Run

Purpose: inspect all normalized evidence and provenance.

Required sections:

- identity: Run ID, status, commit, branch, note, native provenance;
- time: started, finished, duration;
- environment fingerprint: machine/CPU, memory, operating system when recorded, Node version, PostgreSQL version, relevant settings, Docker/runtime context;
- dataset fingerprint: seed, counts/scale, schema or migration identity, validation outcome;
- suite: executor/schema version, scenario count, protocol summary;
- scenario groups and all normalized metrics;
- comparison shortcut to previous and Baseline;
- Benchmark Artifact inventory;
- exact timestamps and units.

Metrics currently expected include:

- T13/read: query identity, target class such as hot/cold, page/depth context, median execution latency, repetition count, and plan reference;
- T14/load: shape, clients, strategy, synchronous commit mode, duration, repetitions, TPS, debit/credit TPS, p50/p95/p99 overall and where available by debit/credit;
- reliability/contention: attempts per success, serialization failures, version conflicts, deadlocks, exhausted operations, errors, failed Payments, lock acquisition mean/p95, average lock waiters, PostgreSQL rollbacks/deadlocks, and sample count;
- suite duration and scenario duration;
- protocol metadata and aggregation such as median and minimum–maximum range.

The contract is extensible. Unknown future metric keys that include valid labels, units, directions, and numeric values must have a usable generic presentation.

### 7. Run detail — imported Run

Purpose: preserve T13/T14 historical evidence without overstating completeness.

Required differences:

- prominent but non-alarming `Imported` provenance;
- original experiment identity and evidence links;
- unavailable values rendered as “Not recorded” or equivalent, never zero;
- explanation that the Run predates the canonical executor;
- comparison eligibility based on actual compatibility, not merely its imported status;
- no active progress treatment.

### 8. Run detail — incomplete Run

Purpose: diagnose a suite that failed or was interrupted.

Required information:

- `INCOMPLETE` status and non-comparable explanation;
- failed or interrupted scenario/stage;
- command or scenario identity;
- start/failure times and elapsed duration;
- process exit status or interruption reason;
- concise failure summary;
- completed measurements clearly separated from comparable evidence;
- complete sanitized logs and related Artifacts;
- no Baseline action;
- no misleading overall performance classification.

### 9. Benchmark Artifacts

Purpose: inspect supporting evidence without confusing it with normalized metrics.

Artifact types may include:

- execution log;
- error output;
- PostgreSQL query plan;
- raw structured measurement;
- validation output.

Required behavior:

- list type, name, size, creation time, associated scenario, and availability;
- inline text view for sanitized content;
- copy and download actions where supported;
- fixed-width readable text, line wrapping control, and horizontal scrolling;
- clear empty/missing-local-file state;
- loading and fetch-error states;
- bounded initial display with deliberate access to more content for very large logs;
- safe rendering as plain text, never executable HTML;
- disclosure that Artifacts are retained locally and may be absent on another machine.

The design must not reveal database URLs, passwords, API keys, or secret environment variables in illustrative content.

### 10. Historical trend

Purpose: reveal gradual change across more than two Runs.

Required controls and context:

- scenario selector;
- metric selector;
- exact unit and desirable direction;
- selected time/history range if necessary for readability, without inventing a product requirement for arbitrary date querying;
- current Baseline reference.

Required visualization behavior:

- plot only compatible `COMPLETED` measurements in a continuous series;
- show exact value, commit, timestamp, and note on accessible inspection;
- represent the Benchmark Baseline distinctly;
- show `INCOMPLETE` Runs as timeline events without metric points;
- break the series rather than connecting incompatible definitions/environments;
- distinguish improved/stable/regressed without relying only on color;
- provide an accessible table or equivalent exact-value alternative;
- handle one point, no points, missing values, dense history, and imported Runs.

Avoid smoothing that implies measurements that did not occur.

## Illustrative content

The designer may use this content to communicate hierarchy. It is illustrative only and is not an API contract.

```text
Latest Benchmark Run
COMPLETED

Commit      8a2c91f
Branch      feature/settlement-index
Note        After adding settlement lookup index
Started     Sep 23, 2026, 14:08:12 BRT
Duration    78m 24s
Baseline    run_2026-09-16_1830
```

```text
Concurrency / Mixed hot Wallet / 64 clients / advisory / sync on

Metric       Current     Previous      Delta       Change
TPS          164.4       151.2         +13.2       Improved +8.7%
p99          746.6 ms    701.3 ms      +45.3 ms    Regressed +6.5%
Deadlocks    0           0             0           Stable
Waiters      62.77       61.90         +0.87       Stable +1.4%
```

```text
Scenario compatibility

account-history-hot       Comparable
account-history-cold      Comparable
settlement-mixed-64       Changed definition
settlement-wide-128       New — no previous measurement
legacy-offset-deep        Removed from selected Run
```

```text
INCOMPLETE

Failed scenario
T14 / shape M / 64 clients / optimistic / synchronous_commit=on

Exit status
2

Failure summary
Benchmark process exited before all three repetitions completed.
```

## Shared state patterns

Design reusable treatments for:

### Run status

- `RUNNING`;
- `COMPLETED`;
- `INCOMPLETE`;
- `Imported` provenance as an attribute, not a fourth lifecycle state.

### Performance Change

- `Improved`;
- `Stable`;
- `Regressed`;
- not comparable;
- not recorded;
- new;
- removed;
- changed definition.

### Data state

- initial loading;
- background refresh;
- empty history;
- API error with retry;
- capability unavailable;
- missing local Artifact;
- malformed record isolated;
- disabled action with explanation;
- successful Baseline update with pending Git change.

## Data presentation rules

### Numbers and units

- Use tabular numerals where aligned comparisons benefit.
- Keep units next to values or in an unambiguous header.
- Do not mix seconds and milliseconds without explicit conversion.
- Preserve enough precision to reflect the source while avoiding meaningless extra decimals.
- Distinguish counts, rates, durations, percentages, bytes, and dimensionless ratios.
- Never render missing data as `0`.

### Percentiles

- Spell out latency context near p50, p95, and p99.
- Do not imply p99 is an average.
- Overall, debit, and credit percentiles need distinct labels.

### Technical identifiers

- Run IDs, commits, scenario IDs, fingerprints, and Artifact names may be long.
- Use compact display with access to the complete value.
- Copy actions need accessible feedback.
- Do not truncate two identifiers into visually identical strings within the same context.

### Date and time

- Use one consistent display timezone and expose exact timestamps.
- Relative time may supplement but not replace exact time.
- Trend axes must avoid ambiguous date formats.

### Tables and matrices

- Keep scenario identity visible while horizontally scrolling when practical.
- Align current and reference values for scanning.
- Sorting or filtering may be proposed for large result sets, but must not imply execution filtering.
- Preserve table headers and context in responsive alternatives.

### Logs and plans

- Use a legible monospace treatment.
- Preserve line breaks.
- Offer wrap/no-wrap behavior if useful.
- Search within a log may be proposed as presentation-only convenience, but is not required for the first implementation.
- Never syntax-highlight content in a way that executes or trusts embedded markup.

## Accessibility requirements

- Target WCAG 2.2 AA contrast and interaction expectations.
- All routes, selectors, disclosure controls, confirmation actions, logs, and downloads must work with a keyboard.
- Focus must be visible and restored sensibly when dialogs close.
- Status and Performance Change require text and non-color cues.
- Live progress updates should use restrained announcements; frequent log lines must not flood assistive technology.
- Tables need meaningful headers and relationships.
- Charts require an accessible exact-value alternative.
- Tooltips cannot be the only way to access a value.
- Motion must respect reduced-motion preferences.
- Large logs must remain navigable without trapping keyboard focus.

## Design system scope

Extend the existing local shadcn/Tailwind vocabulary only as needed:

- Run status badge;
- Performance Change indicator;
- provenance label;
- metric summary card;
- aligned metric comparison row/table;
- compatibility notice;
- Run selector;
- scenario-group disclosure or navigation;
- progress/stage list;
- timeline or trend chart plus table;
- Artifact inventory;
- plain-text log/plan viewer;
- Baseline confirmation and pending-Git notice;
- benchmark-specific loading, empty, error, unavailable, and missing-Artifact states.

Do not propose a separate design-system package.

## Content and tone

Use concise technical English.

Prefer:

- “Compared with previous compatible Run”
- “Stable within the 5% tolerance”
- “Scenario definition changed”
- “No previous measurement”
- “Artifact is not available on this machine”
- “Benchmarks are available only in local development”
- “Run benchmarks from the terminal”
- “Set as Baseline”

Avoid:

- “Performance is good” without evidence;
- “Statistically significant”;
- “0” for unrecorded metrics;
- “Live” when data is periodic polling;
- celebratory or alarming language for small changes;
- “Run now,” “Cancel,” “Pause,” or partial-suite controls;
- production-enable prompts;
- playful laboratory metaphors that reduce operational clarity.

## Expected design deliverables

Please provide:

1. Benchmarks navigation integrated into the existing desktop and mobile shell.
2. Desktop, compact desktop/tablet, and mobile overview frames.
3. Completed, running, incomplete, imported, empty, unavailable, loading, and error overview states.
4. Benchmark Comparison with default previous reference, custom selection, Baseline reference, all compatibility states, and responsive behavior.
5. Completed native, imported, and incomplete Run detail concepts.
6. Artifact inventory plus complete log/query-plan viewer states.
7. Historical trend with accessible exact-value alternative and edge states.
8. Baseline confirmation, success, failure, ineligible, and pending-Git states.
9. Component states: default, hover, focus, active, selected, disabled, loading, success, warning, failure, and unavailable.
10. Responsive notes for metric matrices, comparison tables, selectors, logs, scenario groups, and trends.
11. Reusable components, tokens, measurements, icons, and any chart specification needed for implementation.
12. A short annotation identifying which content is illustrative and which fields are required by this brief.

## Designer freedom

The designer owns:

- composition and visual hierarchy within these requirements;
- density, typography, spacing, dividers, surfaces, and iconography;
- how scenario groups are navigated or disclosed;
- comparison-table and trend composition;
- appropriate chart form, if a chart materially improves understanding;
- responsive transformations;
- subtle motion and transitions that do not obstruct analysis;
- visual distinction between normalized metrics and diagnostic Artifacts.

The designer should challenge a requirement that harms clarity and propose an alternative preserving the same operational meaning. New product capabilities require explicit approval and must not be hidden inside visual design.

## Non-negotiable constraints

- UI copy is English.
- Reuse the PayLab Operational Console shell and visual system.
- Benchmarks are local-development-only.
- Execution starts only from the terminal.
- No run, cancel, pause, retry-suite, schedule, or scenario-selection controls.
- No dirty-worktree Run concept.
- No automatic Git commit or push action.
- No incomplete Run in comparisons or Baseline selection.
- No numeric comparison across incompatible scenarios or environments.
- No missing value represented as zero.
- No composite performance score.
- No invented metrics or production data.
- No secrets, connection strings, or unsanitized logs.
- No status or change meaning communicated by color alone.
- Exact values remain accessible when charts are present.
- All Benchmark Summaries are immutable; only the Baseline pointer can change.
- Loading, empty, error, unavailable, missing-Artifact, incompatible, imported, running, completed, and incomplete states are first-class.

## Engineering review checklist after handoff

Engineering will evaluate the returned design against:

- the Benchmark Observability PRD and task plan;
- canonical language in both project `CONTEXT.md` files;
- API ADR 0011 and the local-only security boundary;
- terminal-only execution and clean-revision requirements;
- lifecycle and Baseline eligibility rules;
- actual T13/T14 metrics and protocols;
- generic support for future scenario/metric contracts;
- previous/custom/Baseline comparison behavior;
- per-scenario compatibility and 5% direction-aware classification;
- exact-value access and absence handling;
- polling rather than streaming semantics;
- Artifact sanitization and missing-local-file behavior;
- responsive behavior at the required frames;
- WCAG 2.2 AA, keyboard behavior, focus, and non-color meaning;
- implementation feasibility with Next.js, React, TypeScript, shadcn/ui, Tailwind CSS, TanStack Query, and the accepted test seams;
- strict adherence to scope and absence of unsupported future behavior.

Engineering may request design changes required for correctness, accessibility, security, API truthfulness, or implementation feasibility. Visual choices remain the designer's responsibility unless they conflict with those constraints.
