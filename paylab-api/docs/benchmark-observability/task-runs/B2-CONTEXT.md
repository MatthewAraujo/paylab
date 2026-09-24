# B2 Context

## Task

Terminal-only `benchmark:run` shell: clean-worktree enforcement, exclusive lock with stale-run recovery, optional note, incremental progress (`RUNNING` state), child-process capture with sanitization, local Artifact layout, and atomic terminal Summary publication. Scenarios are injected as commands so the shell is tested with a fake suite; B3/B4 register the real ones. Spec: `../tasks/B2.md`.

## Related PRD Acceptance Criteria

US-1..6, 11..18, 20..30, 65. Key rules: never starts implicitly; dirty or untracked worktree rejected (gitignored Artifacts ignored); one active Run; abandoned `RUNNING` recovered as `INCOMPLETE`; failed scenario keeps completed measurements and failure details; secrets redacted before storage; Summary atomic and immutable; no automatic commit; report generated files and a suggested commit message; pending generated files block the next Run (they make the worktree dirty).

## Relevant Prior Summaries

`task-runs/B1-summary.md`: use `parseSummary`, `serializeSummary`, `canTransition`, `scenarioFingerprint`, `fingerprint` from `@/domain/benchmark/*`; results are `Either`. B1 leaves Run progress detail to B2.

## Files Likely Affected

- New `scripts/benchmark-run.ts` (CLI) and `scripts/benchmark/{git,lock,sanitize,store,executor,environment,suite}.ts`.
- `package.json` (`benchmark:run`), `.gitignore` (`.benchmark/`), `.env.example` (`BENCH_ARTIFACT_ROOT`, `BENCH_SUMMARY_DIR`).
- Additive optional scenario timing fields in `src/domain/benchmark/summary.ts` (US-22 needs timestamps and duration).
- New `test/scripts/benchmark-*.spec.ts` and `test/support/git-repo.ts`.

## Test-First Plan

Seam: `runBenchmark(options)` against a real temporary Git repository, a temporary Artifact root, and real child processes running controlled `node -e` scenarios (unit config, no Docker). Slices, each RED then GREEN: sanitizer; worktree check; happy path (Summary, progress, artifacts, no commit, report); failing scenario; dirty/untracked/ignored and pending-file block; lock and stale recovery; abort; end-to-end redaction; CLI argument parsing.

## Constraints

- Repo style (biome). Scripts follow `scripts/demo/` conventions. No production `src/` change except the additive schema fields.
- Never target a database in B2; scenarios and dataset info are injected.
- Resolve all storage paths before use; identifiers used as file names must satisfy `safeId`.
- Do not edit the PRD or task files.

## Risks

- Liveness check of a lock owner (pid reuse): acceptable for a single-developer local tool; documented.
- Recovery writes a versioned Summary, so the same invocation is then blocked by the dirty worktree until it is committed; the message must say so.

## Definition of Done

Every lifecycle behavior above covered by passing tests without the heavy benchmark; `pnpm test`, `pnpm typecheck`, `pnpm lint` green; one commit with code, tests, this file, the summary, and the index update.
