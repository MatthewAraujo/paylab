# B2 Summary

## Status

Done. Every lifecycle behavior in the B2 spec is implemented test-first and validated with a controlled fake suite; the heavy benchmark was not run (it is B3/B4/B8).

## What Changed

`pnpm benchmark:run [--note <text>]` now exists as a terminal-only command that always runs the complete registered suite. Its core is `runBenchmark(options)` in `scripts/benchmark/executor.ts`:

- Scenarios are injected as `ScenarioSpec` (definition + `command`/`args`), run sequentially as child processes. A scenario reports metrics by printing one line `BENCH_RESULT <json array of metrics>`; every other output line is log. Exit code 0 plus a valid result is success.
- Start: scenario ids validated as safe file names, exclusive lock taken (a live owner is reported with its Run id and stage; a dead owner's Run is recovered as `INCOMPLETE`), then `assertCleanWorktree` (tracked and untracked changes reject; gitignored Artifacts do not). Run id is `<UTC timestamp>-<commit7>`.
- Progress: a mutable `RUNNING` record at `<artifactRoot>/runs/<runId>/state.json`, rewritten atomically after each transition (`PENDING` to `ACTIVE` to `COMPLETED`/`FAILED`), and `onProgress` callbacks.
- Output: each scenario log is sanitized line by line into `<artifactRoot>/runs/<runId>/artifacts/<scenarioId>-log.log` and referenced as a `LOG` artifact.
- Finish: failed scenario, failed preparation, or abort gives `INCOMPLETE` with completed measurements kept, later scenarios `PENDING`, and failure evidence (scenario, command, exit status, summary; per-scenario timing). The terminal Summary is written with `link()` so it can never overwrite one, at `<summaryDir>/<runId>.json` (default `bench/results/`), then the running state is removed and the lock released. Nothing is committed; the result lists generated files and a suggested commit message.
- The environment is an allowlist (node, platform, arch, CPU, memory, plus suite-provided facts), never the process environment.
- Recovery writes a versioned `INCOMPLETE` Summary, so that invocation is then blocked by the dirty worktree until it is committed.
- Contract change in B1's schema: optional per-scenario `startedAt`, `finishedAt`, `durationMs`.

## Files Changed

- New: `scripts/benchmark-run.ts`, `scripts/benchmark/{cli,environment,executor,git,lock,recovery,sanitize,store,suite}.ts`
- New tests: `test/scripts/benchmark-{cli,git,lock,run,sanitize}.spec.ts`, `test/support/{git-repo,benchmark-suite}.ts`
- Modified: `src/domain/benchmark/summary.ts` (additive timing fields), `package.json` (`benchmark:run`), `.gitignore` (`.benchmark`), `.env.example` (`BENCH_ARTIFACT_ROOT`, `BENCH_SUMMARY_DIR`)
- Docs: `TASKS.md`, `task-runs/B2-CONTEXT.md`, `task-runs/B2-summary.md`

## Tests Added or Updated

40 new tests in 5 specs (unit config, no Docker): sanitizer forms; worktree check on a real temporary Git repo; executor happy path, progress visible on disk, no commit, no environment leak; failing, silent, and preparation-failing suites; dirty-tree rejection and pending-Summary block then unblock; unsafe scenario ids; real concurrent second invocation; live lock untouched; stale-run recovery (with and without state); lock release; abort of a hanging scenario; end-to-end redaction; CLI argument rules (no scenario selection), report, exit codes, secret collection, Artifact-root ignore check. A test caught a real bug (a trimmed porcelain status line cut file names).

## Commands Run

- `pnpm exec vitest run test/scripts` (RED then GREEN per slice)
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- `pnpm benchmark:run --scenario t14` and `pnpm benchmark:run` (both refuse with exit 2 as designed)

## Validation Result

`pnpm test`: 33 files, 213 tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean. No orphaned test child processes left behind.

## Decisions Made

- The primary seam is the in-process `runBenchmark` against a real temporary Git repository and real child processes (not a spawned CLI), so it stays fast and Docker-free; the CLI entrypoint is thin and its logic is unit-tested.
- Lock: exclusive `wx` file at `<artifactRoot>/lock.json` with pid and Run id; liveness by `process.kill(pid, 0)`. Pid reuse is an accepted limitation for a single-developer local tool.
- The lock is taken before the Git check so a concurrent invocation reports the active Run instead of a misleading clean-tree result.
- Versioned Summaries default to `bench/results/`; the local Artifact root defaults to `.benchmark/` (ignored). The CLI refuses an in-repo Artifact root that Git does not ignore.
- A published INCOMPLETE Run from a failed preparation keeps the placeholder dataset fingerprint `pending`.

## Follow-up Needed

- `scripts/benchmark/suite.ts` is an empty registry: `benchmark:run` refuses to run until B3 registers scenarios.
- `benchmark:run` and the storage paths are not yet in `PROJECT.md` or `docs/benchmark.md` (B8).
- Scenario commands run with the full process environment; B3/B4 should pass only what each scenario needs via `ScenarioSpec.env`.

## Context for Next Task

B3 registers the dataset/preflight/reset as `suite.prepare()` (returning dataset fingerprint and description; pass PostgreSQL facts through `RunOptions.environment`) and T13 scenarios as `ScenarioSpec`s whose command prints `BENCH_RESULT` metrics (use `scenarioFingerprint` through `definition`; `summaryRole` on headline metrics). Failing gates simply exit non-zero. Reuse `bench/lib/seed.ts`, `stats.ts`, and `bench/run.ts`'s "bench" name guard. B6 reads Summaries from `bench/results/` and running state plus Artifacts from `.benchmark/runs/<runId>/`.
