# T15 Context

## Task

Rewrite `PROJECT.md` for PayLab, finish CI and developer documentation (`docs/tasks/T15.md`). Lane C of the T10-T15 run; documentation and pipeline only.

## Related PRD Acceptance Criteria

US-80 (local run, inherited logging), US-81 (migrations build the full schema), US-84 (CI gate).

## Relevant Prior Summaries

T2 (CI jobs, Testcontainers, concurrency job is non-blocking), T7 (`merchant:provision`), T9.

## Files Likely Affected

`PROJECT.md`, `docs/DEVELOPMENT.md`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`.

## Test-First Plan

Validation checks defined up front: every `pnpm` command in the docs exists in `package.json`; workflow YAML parses; guide steps run (install, lint, typecheck, test layers, migrate, provision, build, boot, `/health`); search finds no reference-project product terms; nothing under `petagro-api` is tracked.

## Constraints

No `src/` or `test/` edits; no domain knowledge in PROJECT.md; no mention of read endpoints or benchmarks yet.

## Risks

`.github/` lives in `paylab-api/`, while the git root is one level up, so GitHub Actions only picks it up if `paylab-api` is the repository root when published.

## Definition of Done

A newcomer can follow PROJECT.md to a green test run and a running app; CI splits the fast gate from the concurrency job.
