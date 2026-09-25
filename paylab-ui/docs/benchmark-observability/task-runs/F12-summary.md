# F12 summary — accessibility, browser smoke, documentation

Status: done, with the manual checklist unverified. Validation (exit codes): `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 (58 files, 466 tests), `pnpm build` 0, `pnpm test:e2e` 0 (2 tests).

## What was built

- `tests/e2e/benchmarks.spec.ts`: Playwright smoke with the benchmark API intercepted (typed fixtures from `src/test/benchmark-fixtures.ts`). Covers navigation to Benchmarks, the latest Run read from the configured API URL, comparison, Run detail, opening an Artifact by keyboard with focus restored on close and a visible focus indicator, and the Baseline `PUT` whose body is exactly `{ runId }`.
- `src/app/globals.test.ts`: AA contrast (4.5:1) for the text/background token pairs including `--success`, and a reduced-motion rule. The reduced-motion test was red first; `--success` needed no change.
- `src/app/globals.css`: `prefers-reduced-motion: reduce` rule (global, so it also calms existing loading skeletons).
- `next.config.ts`: `allowedDevOrigins: ["127.0.0.1"]`. Without it the dev server blocked client bundles for Playwright's origin and pages stayed on their loading state.
- `PROJECT.md`, `CONTEXT.md`, `.env.example`: capability, routes, decisions, without duplicating each other.
- `F12-manual-checklist.md`: unverified steps for layout at 1440/1024/390 px, 200% zoom, keyboard, and a real local API.

## Not verified

- The real cross-origin CORS preflight of the Baseline `PUT`: the smoke test fulfils preflight itself. Check it in the manual checklist.
- Layout at the three widths and 200% zoom, and greyscale legibility: manual only.
- Status/change text meanings rely on the existing badge tests (F4); no new test was added for them.

## Follow-ups

- Biome warns about `!important` in the reduced-motion rule (deliberate; warnings only).
