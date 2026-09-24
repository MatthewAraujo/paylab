# B8 Context

## Task

Validate the integrated API workflow, document its operation, and record the first native full Run. Spec: `../tasks/B8.md`.

## Related PRD Acceptance Criteria

US-1 (one command runs the complete suite), 64 (OpenAPI), 65 (command and HTTP boundary validation), plus end-to-end validation of the rest.

## Relevant Prior Summaries

B1 to B7 summaries: contract, executor shell, dataset and T13 scenarios, T14 matrix and gate, importer, read API, Baseline. Open items they left for B8: the size of a T14 Summary, timing of the full Run, and the operating documentation.

## Files Likely Affected

`PROJECT.md`, `docs/benchmark.md`, `docs/DEVELOPMENT.md`, `CONTEXT.md`, `.env.example` (already current), a documentation drift test and a production-mode e2e.

## Test-First Plan

A documentation test (every `pnpm` command exists, every benchmark script and `BENCH*` variable is documented, links resolve, the storage and access facts are stated) written failing first; a production-mode e2e using the real environment resolution; the full gate set with every exit code recorded.

## Constraints

- The first native full Run drops and recreates the developer's `paylab_bench`, needs the developer's template, and takes about two hours: it is not run by the agent without an explicit go-ahead. Everything short of it is validated.
- Keep decisions and rationale in `CONTEXT.md`; `PROJECT.md` gets only stable commands, layout, and variables.
- The UI-side gates (Playwright smoke, client regeneration) belong to the UI plan.

## Risks

- Documentation drifting from the code (guarded by the drift test).
- The exact production protocol is unproven until the manual Run happens.

## Definition of Done

All automated gates pass with recorded exit codes, production exposes no benchmark route, the operating documentation is current and checked, and the first native Run is either done and reviewed or explicitly listed as pending.
