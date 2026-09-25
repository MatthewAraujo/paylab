---
status: accepted
---

# Version benchmark summaries and retain artifacts locally

Benchmark Runs publish small normalized Summaries to Git for durable, commit-linked history, while large sanitized logs and query plans remain local Benchmark Artifacts with no automatic expiration. A development-only API exposes both to the Operational Console; this preserves auditable metrics without growing the repository or exposing diagnostic output in production, at the cost that full Artifacts are available only on the machine that executed the Run.

## Consequences

The executor accepts only a clean worktree, never commits results automatically, and leaves a new Summary for explicit review and commit. Baseline selection is also versioned, while missing local Artifacts do not invalidate an existing Summary.
