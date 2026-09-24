# Tasks — Benchmark Observability (Operational Console)

## Source Context

- PRD: [PRD.md](PRD.md). Acceptance criteria are its numbered user stories, referenced as `US-n`.
- Visual direction (accepted with corrections): [../BENCHMARKS-DESIGN-BRIEF.md](../BENCHMARKS-DESIGN-BRIEF.md) and [../BENCHMARKS-DESIGN-REVIEW.md](../BENCHMARKS-DESIGN-REVIEW.md). The reference prototype `../../PayLab-Benchmarks-source/` (static HTML, CSS, JavaScript, and design notes) is read-only and never imported.
- Backend contract and operation: `../../../paylab-api/docs/benchmark.md` (routes under `/v1/benchmarks`), the API plan `../../../paylab-api/docs/benchmark-observability/`, and ADR 0011.
- Project handbook and language: `../../PROJECT.md`, `../../CONTEXT.md`, `../../../paylab-api/CONTEXT.md`. The completed console MVP plan is `../TASKS.md` (T1 to T18); task ids here use the `F` prefix.
- Existing seams: `src/components/app-shell.tsx` (navigation registry and mobile Sheet), `src/api/` (capability detection, generated types, failure handling), `src/features/health/` (browser-side TanStack Query precedent), the route and component tests with a typed fetch stub in `src/test/`, `tests/e2e/navigation.spec.ts`, `src/lib/datetime.ts` (UTC convention) and `src/lib/money.ts`.
- Next.js 16 differs from earlier majors: read `node_modules/next/dist/docs/` (per `AGENTS.md`) before writing route code.

## Implementation Goal

Add a Benchmarks area to the Operational Console that observes the API's benchmark evidence honestly and never starts a benchmark: an overview with declared headline measurements and live progress for an active Run, a complete Run detail with a safe Artifact viewer, Comparisons with per-scenario compatibility and direction-aware classification within a 5% band, a confirmed Baseline selection that discloses its Git effect, and historical trends with exact values, all built on the existing shell and the generated contract.

## Non-Goals

- Starting, cancelling, pausing, scheduling, or narrowing a benchmark Run from the console.
- Backend changes, including declaring the missing error-rate and duration summary roles, and compacting the versioned Summary.
- Statistical significance, alerts, budgets, quality gates, or a composite performance score.
- Streaming (WebSocket or server-sent events), server-side proxying of benchmark reads, or a charting library.
- Automatic Git commits or pushes; deleting or editing Runs or Artifacts.
- Importing anything from the design prototype, a global typography or font change, or redesign of the financial views.

## Tasks

| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [F1](tasks/F1.md) | Refresh the contract and derive the Benchmarks capability | — | done | [context](task-runs/F1-CONTEXT.md) | [summary](task-runs/F1-summary.md) |
| [F2](tasks/F2.md) | Typed benchmark client, failure taxonomy, and test support | F1 | done | [context](task-runs/F2-CONTEXT.md) | [summary](task-runs/F2-summary.md) |
| [F3](tasks/F3.md) | Pure benchmark presentation rules | F1 | done | [context](task-runs/F3-CONTEXT.md) | [summary](task-runs/F3-summary.md) |
| [F4](tasks/F4.md) | Navigation, route frames, design-system pieces, and shared states | F1 | done | [context](task-runs/F4-CONTEXT.md) | [summary](task-runs/F4-summary.md) |
| [F5](tasks/F5.md) | Overview of the latest Benchmark Run | F2, F3, F4 | in_progress | — | — |
| [F6](tasks/F6.md) | Active Run: progress and recent log | F5 | planned | — | — |
| [F7](tasks/F7.md) | Run detail | F2, F3, F4 | in_progress | — | — |
| [F8](tasks/F8.md) | Artifact viewer | F2, F4 | in_progress | — | — |
| [F9](tasks/F9.md) | Benchmark Comparison | F2, F3, F4, F7 | planned | — | — |
| [F10](tasks/F10.md) | Baseline selection | F7, F9 | planned | — | — |
| [F11](tasks/F11.md) | Historical trends | F2, F3, F4 | ready | — | — |
| [F12](tasks/F12.md) | Accessibility, responsive polish, browser smoke, and documentation | F1–F11 | planned | — | — |

## Acceptance Criteria Mapping

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| US-1..3 navigation and current section | F4 | component | planned |
| US-4..6 capability unavailable, unreachable API, local-only wording | F1, F2, F4 | unit, component | planned |
| US-7..8 no execution controls, terminal note | F4 | component | planned |
| US-9..12 latest Run identity, provenance, Baseline identity | F5 (F10 for the action) | route | planned |
| US-13..17 declared headline measurements and formatting | F3, F5 | unit, route | planned |
| US-18..24 previous and Baseline difference, notable changes, groups, history, entries | F3, F5 | unit, route | planned |
| US-25..31 active Run progress, polling, abandoned records, announcements | F6 | route with fake timers | planned |
| US-32..34 loading, empty, error, refresh failure, isolated records | F2, F4, F5 | unit, route | planned |
| US-35..42 Run detail, metrics, dimensions, absent values, lazy tables, shortcuts | F3, F7 | unit, route | planned |
| US-43..46 Incomplete Run failure, diagnostic-only measurements | F7 | route | planned |
| US-47..49 separate Imported Runs and eligibility | F7 | route | planned |
| US-50..51 Artifact inventory and missing files | F7 | route | planned |
| US-52..58 Artifact viewer | F8 | component | planned |
| US-59..64 comparison selection, defaults, swap, eligibility, compatibility | F9 | route | planned |
| US-65..74 states, deltas, classification, counts, tolerance note | F3, F9 | unit, route | planned |
| US-75 responsive comparison tables | F9, F12 | component, manual | planned |
| US-76..82 Baseline selection | F10 | route | planned |
| US-83..90 trends | F3, F11 | component, route | planned |
| US-91..95 non-color meaning, keyboard, responsive, motion, English copy | F4, F12 | component, e2e, manual | planned |
| US-96 observable tests | F1–F12 | unit, component, route, e2e | planned |

## Test Strategy

- **Unit**: capability derivation, the failure taxonomy, and every presentation rule (F3), with literals independent of the code and the API's boundary cases reused.
- **Rendered route and feature tests** (the highest seam): typed fixtures and a request-routing fetch stub at the network boundary; polling with fake timers; no production mock mode.
- **Component tests**: trend chart and its exact-value table, the plain-text viewer, badges, dialogs, and focus.
- **Browser smoke** (Playwright with request interception) plus a written manual check against a real local API with the imported evidence.
- **Commands**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, and `pnpm sync:api` for the contract refresh (needs a running local API).

## Risk Plan

- **Payload size**: a full concurrency Run record is about 555 KB and a comparison needs two; keep groups collapsed and render lazily, and fetch full records only where the page computes from them.
- **Two definitions of Performance Change**: the console follows the approved design for a zero reference while the API's unused pure function differs; pin the shared boundary cases in tests and record the divergence for later alignment.
- **Stale contract**: a snapshot behind the API breaks silently; F1 adds a test that fails on a missing route, and fixtures are typed by the generated schema.
- **Capability confusion**: a disabled API answers 404 without an error code while a missing Run answers 404 with one; the taxonomy tests pin the difference and the unavailable state must never look like a loading failure.
- **Polling**: a dead process leaves a RUNNING record; poll only while running and owned, stop on abandoned, and cap the interval.
- **Cross-origin write**: the Baseline `PUT` depends on the API's CORS allowing the console origin; verify once in the smoke test.
- **Design drift**: the prototype is a reference, not a source; reusing tokens and components avoids a second visual system, and the review's corrections are explicit tasks.
- **Misleading evidence**: never render a missing value as zero, never delta across incompatible scenarios, never classify informational metrics, and keep diagnostic measurements visibly apart from comparable ones.
- **Accessibility of the chart**: exact values, direction, and every event must exist outside the graphic.
- **Next.js 16 differences**: read the bundled guides before touching routing, params, or search params.

## Execution Order

1. F1 contract refresh and capability.
2. F2 client and taxonomy, and F3 pure rules (independent after F1), then F4 navigation and shared pieces.
3. F5 overview, then F6 active Run.
4. F7 Run detail and F8 Artifact viewer.
5. F9 comparison, then F10 Baseline.
6. F11 trends.
7. F12 accessibility, smoke test, and documentation.

## Open Questions

No blocking open questions. Defaults recorded in the PRD, to confirm before or during F5:

- Reading benchmarks directly from the browser (as System Health does) rather than through the Next server.
- The overview features the first scenario that declares highlights (selectable), and error rate stays "not declared" until the API declares a role for it.
- The console follows the design's zero-reference rule; aligning the API's pure function is a separate follow-up.

## Handoff

Ready for `task-runner`. Start with F1, which needs a running local API (ask before starting it if it is not already up).
