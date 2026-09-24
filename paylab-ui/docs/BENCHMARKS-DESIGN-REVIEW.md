# Benchmark Observability — Engineering Design Review

## Review status

**Accepted with implementation corrections.**

The external prototype under `paylab-ui/PayLab-Benchmarks-source/` was reviewed against the Benchmark Observability PRD, task plan, domain language, API ADR 0011, the benchmark-specific design brief, and the current PayLab UI shell. The prototype is a design reference only; its static HTML, CSS, JavaScript, preview state, and illustrative data must not be imported into production code.

Evidence reviewed:

- desktop overview, comparison, historical trend, native Run detail, running Run detail, incomplete Run detail, and imported Run detail;
- mobile overview at approximately 390 px;
- design notes, static markup, styling, interactions, metric calculations, dialog behavior, and accessibility annotations;
- current Next.js shell, theme tokens, shared Card/Badge components, capability behavior, and test conventions.

## Overall visual diagnosis

The design establishes a strong operational hierarchy and is suitable as the visual direction for implementation. It makes provenance, exact measurements, comparison context, and diagnostic evidence more important than decoration. Dense data remains grouped into clear panels, values use aligned monospace treatment, status meaning is reinforced by text and symbols, and the overview/detail split matches the approved product scope.

The strongest areas are the latest-Run context, the four headline measurements, the notable-change panel, the side-by-side comparison selectors, the explicit compatibility table, the exact-value alternative beneath trends, and the separation between normalized measurements and Benchmark Artifacts.

The design should not be implemented pixel-for-pixel. Its preview-only controls, static shell, hard-coded sample selection, tiny supporting type, and several incomplete-state shortcuts need to be translated into the existing application system and real contract.

## Biggest visual and product problems

### 1. Incomplete Runs hide completed diagnostic measurements

The incomplete detail presents failure context and Artifacts but omits measurements from scenarios that finished before the failure. The accepted product model explicitly retains those measurements for diagnosis while excluding them from Benchmark Comparisons.

Why it matters: a long suite may fail near the end. Hiding already collected values removes useful evidence and makes the retained Summary appear less complete than it is.

Required correction: add a clearly labeled **Diagnostic measurements completed before failure** section. It must look visually different from comparable evidence and state that the values cannot participate in comparison or Baseline selection.

### 2. T13 and T14 are visually collapsed into one Imported Run

The prototype uses one `run_imported_t13_t14` record. T13 and T14 have different goals, protocols, metric shapes, and evidence. Combining them weakens provenance and creates an artificial suite that never ran as one historical execution.

Why it matters: imported history must remain truthful. A reader needs to know which experiment produced a query-plan measurement versus a load/concurrency measurement.

Required correction: present at least two imported records, one for T13 and one for T14. Each keeps its own original experiment identity, protocol, evidence links, available metrics, and absent fields.

### 3. Comparison summary combines two materially different states

The comparison counter says **Not comparable / recorded**. Scenario incompatibility and missing historical measurement are different conditions with different remediation and meaning.

Why it matters: an incompatible value must be withheld because comparison would be invalid; a not-recorded value simply does not exist. Combining them makes the health of the evidence difficult to assess.

Required correction: use distinct summary counts and labels for **Incompatible** and **Not recorded**. Keep New, Removed, and Changed Definition visible at scenario level.

### 4. The mobile shell conflicts with the implemented application shell

The prototype uses a horizontally scrolling top navigation and visibly clips the active Benchmarks label at 390 px. The production application already uses a compact header and Sheet-based navigation.

Why it matters: importing the prototype shell would create two responsive navigation systems and make the new page feel detached from the rest of PayLab.

Required correction: retain the existing AppShell and mobile Sheet. Add Benchmarks to the same navigation registry and apply only the benchmark content layouts below the shared page header.

### 5. Headline metrics are hard-coded to one illustrative scenario

The overview chooses throughput and p99 from Mixed hot Wallet / 64 clients / advisory / sync on. The visual label is honest, but the generic scenario contract does not yet say why these measurements, rather than another matrix cell, are the headline values.

Why it matters: future scenarios and suite changes could make a hard-coded frontend selection stale or arbitrary.

Required correction: the benchmark contract must identify explicitly featured measurements or an equivalent stable summary role. The frontend renders those declared highlights and never guesses them from metric names or array order.

### 6. Supporting typography is too small in several dense surfaces

The design relies heavily on 10–11 px table headers, metadata, badges, and secondary descriptions. At desktop scale the overall hierarchy is good, but extended reading of provenance and comparison conditions becomes unnecessarily difficult.

Why it matters: benchmark analysis depends on small contextual differences; reducing context below comfortable reading size works against the evidence-first goal.

Required correction: use the existing application's `text-xs` baseline for secondary content, reserve smaller text for exceptional compact labels, and verify 200% zoom plus narrow-screen reflow. Preserve density through spacing and alignment rather than uniformly shrinking text.

## Concrete visual improvements

- Preserve the prototype's content order: page context, Run identity, headline evidence, notable changes/conditions, scenario groups, and history.
- Keep headline metric cards visually compact and always show their scenario context.
- Render overview highlights from explicit contract metadata; if no highlight is declared, show a calm “No headline measurement configured” state rather than selecting one implicitly.
- Split comparison summary tiles into Improved, Stable, Regressed, Incompatible, and Not recorded. New/Removed/Changed remain scenario compatibility states.
- Add the diagnostic-measurement panel after incomplete failure context and before Artifacts.
- Split the imported design example into T13 and T14 Run details. Do not create a combined historical Run.
- Retain exact-value tables under every chart and break series across compatibility changes.
- Keep the existing mobile Sheet; allow metric and comparison tables to scroll within labeled keyboard-focusable regions.
- Convert prototype tabs into Next.js links for real routes. Use `aria-current="page"` rather than implementing an in-page tab widget for route navigation.
- Remove Design Preview, Design notes, Preview state selectors, illustrative banners, API settings, and UI states controls from production routes.
- Remove phrases such as “illustrative snapshot, not polling” from production; real running content should state the last successful refresh time and polling status.
- Use real unavailable, loading, refresh-error, malformed-record, and missing-Artifact states driven by the API instead of a preview selector.
- Keep the Baseline confirmation and pending Git notice, but use the real API response and preserve the previous Baseline on failure.

## Design system recommendations

### Reusable decisions

- Extend the shared Badge variants with semantic benchmark states: completed/improved, running, incomplete/regressed, stable, imported, incompatible, new, removed, and changed.
- Add a generic monospace MetricValue treatment using existing foreground/muted tokens rather than route-specific raw hex values.
- Add reusable MetricCard, ComparisonMetricRow, CompatibilityBadge, RunStatusBadge, RunIdentity, ArtifactTable, and PlainTextArtifactViewer components only when a second screen proves reuse.
- Map the prototype palette onto existing `background`, `card`, `border`, `primary`, `muted`, and `destructive` tokens. Introduce only semantic improved/running colors that cannot be represented clearly by existing tokens.
- Keep existing radii and panel conventions. Benchmark pages may reduce shadow and padding for dense tables but should not create a second Card system.
- Use the existing application typography. A global move to DM Sans or IBM Plex Mono would affect every route and requires a separate design-system decision; do not add route-specific web-font downloads.

### Local decisions

- Sticky first columns belong only to wide metric comparison matrices.
- Trend chart geometry, progress layout, and Artifact log controls remain benchmark-local.
- The review/preview banner and state simulator remain prototype-only and are not reusable product components.

## Implementation-ready tasks

1. Extend the benchmark evidence contract with an explicit optional headline/summary role for featured measurements and cover deterministic selection with unit tests.
2. Import T13 and T14 as separate Imported Benchmark Runs with independent provenance fixtures.
3. Preserve completed measurements in an Incomplete Benchmark Run and expose them through the API as diagnostic-only evidence.
4. Split comparison aggregate counts into incompatible and not-recorded categories.
5. Add Benchmarks to the existing AppShell navigation, including the current Sheet mobile behavior.
6. Implement overview content using shared tokens and the prototype hierarchy, excluding every preview-only control.
7. Implement route-based Overview, Comparison, Historical trend, and Run detail navigation with Next.js links.
8. Implement incomplete detail with failure evidence, diagnostic completed measurements, and Artifacts in that order.
9. Implement separate imported T13 and T14 details and honest missing values.
10. Implement responsive tables as labeled keyboard-focusable scroll regions and validate sticky-column behavior at 390 px.
11. Raise supporting copy to the application's readable secondary-text baseline and verify zoom, contrast, focus, and non-color meaning.
12. Validate the implementation against desktop 1440 px, compact 1024 px, mobile 390 px, keyboard-only navigation, reduced motion, missing data, and long real identifiers/log lines.

## Risks and scope guards

- The prototype is untracked in the primary worktree at review time. It must be preserved deliberately if it is expected to remain a repository artifact, but it must not be copied into production imports or shipped assets.
- Do not reproduce the prototype's static shell, global event delegation, local illustrative state, or query-string design mode in Next.js.
- Do not add browser execution, cancellation, scheduling, partial-suite selection, automatic commits, or remote benchmark enablement.
- Do not infer full commit hashes, timestamps, environment facts, dataset facts, or missing metrics from illustrative values.
- Do not make native `COMPLETED` Runs tolerant of missing required provenance merely because the prototype shows “Not recorded”; the production contract should reject or isolate malformed native Summaries.
- Do not treat the 5% tolerance as statistical significance.
- Do not introduce a charting dependency until the trend implementation proves that accessible SVG/HTML primitives are insufficient.
- Do not broaden the visual changes to unrelated financial routes while implementing Benchmarks.

## Acceptance decision

The external design satisfies the intended product direction and may guide implementation after the corrections above are incorporated into the contract and tasks. No additional external redesign is required before TDD. Visual QA remains required after the real Next.js implementation because the supplied artifact is a static prototype rather than the production component system.
