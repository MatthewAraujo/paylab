# T5 Context

## Task
[T5](../tasks/T5.md): manual backup and stop-first restore (documented and drilled), production-local documentation, and the development regression.

## Related PRD Acceptance Criteria
AC-14, AC-15, AC-16, AC-1.

## Relevant Prior Summaries
- [T1](T1-summary.md): `dotenv`/Biome were reclassified; the API typecheck, lint and tests were deferred to this task.
- [T3](T3-summary.md) and [T4](T4-summary.md): the stack runs with 6 Wallets and 174 Payments; `backups/` is gitignored; Docker does not restart merely unhealthy containers.

## Files Likely Affected
Root `PROJECT.md` and `README.md`, API/UI `PROJECT.md`, API `CONTEXT.md`.

## Test-First Plan
- AC-14: the documented dump lands in the ignored `backups/`.
- AC-15: drill: backup, write a probe Payment, stop api/ui, restore, start; the count returns to the backup value and authentication still works.
- AC-16: documentation review against the PRD list.
- AC-1: the development stack starts in development mode, the reload regression passes, and the API/UI checks pass.

## Constraints
Drill only on `paylab-production` after a fresh backup. Never remove development volumes. The development and production-local stacks share ports.

## Risks
The ledger triggers could reject restored rows; the drill verifies they do not.

## Definition of Done
Drill and regression evidence recorded; documentation reviewed.
