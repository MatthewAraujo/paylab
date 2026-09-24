# B1 Context

## Task

Pure benchmark evidence contract: versioned Zod schemas and rules for Runs, Summaries, scenarios, protocols, metrics, environment and dataset fingerprints, Artifact references, compatibility, Baseline reference, default comparison pair, and Performance Change math. No Nest, Prisma, filesystem, or HTTP imports. Spec: `../tasks/B1.md`.

## Related PRD Acceptance Criteria

US-5, US-6, US-38..42, US-48..51, US-54, US-65. Key rules: explicit schema version, unknown versions rejected; absent stays absent (never zero); incomplete Runs never comparable; stable within exactly ±5%; direction-aware; explicit summary role; terminal Summaries immutable.

## Relevant Prior Summaries

None (first task). Prior art for layout: `src/domain/paylab`, `src/core/either.ts`, unit specs in `test/domain/`.

## Files Likely Affected

- New `src/domain/benchmark/` (schemas, serializer, fingerprint, compatibility, comparison, lifecycle).
- New `test/domain/benchmark/*.spec.ts`.
- New shared fixtures in `test/support/benchmark-fixtures.ts`.

## Test-First Plan

Unit (vitest, `pnpm test`): record parsing per kind/status; rejection of malformed, unsafe identifiers, unknown schema version; metric direction and ±5% boundary, zero reference and absent values; compatibility (unchanged/new/removed/changed/dataset/environment); deterministic serialization and fingerprints; default comparison pair; lifecycle transitions.

## Constraints

- Follow repo style (biome: tabs, single quotes, no semicolons). Use Zod (already a dependency).
- Generic metric keys; scenario-specific config lives in the scenario payload.
- No edits to the PRD or task files; no unrelated changes.

## Risks

- Over-designing the schema (YAGNI): model only what the PRD and B2–B7 need.
- Fingerprint instability from key order: canonicalize before hashing.

## Definition of Done

All rules covered by passing unit tests; `pnpm test`, `pnpm typecheck`, `pnpm lint` green; one commit with code, tests, this file, the summary, and the index update.
