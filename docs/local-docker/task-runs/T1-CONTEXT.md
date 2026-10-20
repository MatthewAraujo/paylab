# T1 Context

## Task
[Complete Docker demo startup](../tasks/T1.md).

## Related PRD Acceptance Criteria
AC-1–AC-5: single command, reload, authenticated demo, persistence, documentation.

## Relevant Prior Summaries
None.

## Files Likely Affected
Root compose.yaml, README.md; API/UI Dockerfiles and ignores; API scripts/docker-demo.ts; UI server client and existing tests; scripts/check-docker-reload.py for the HTTP reload regression.

## Test-First Plan
Failing Compose config before files exist; failing internal server routing regression before implementation; actual startup, authenticated reads and repeated startup after implementation.

## Constraints
Do not replace existing benchmark PRD/plan, loosen demo host guards, reset data, or expose credentials.

## Risks
A seed interrupted between database commit and credential persistence must fail explicitly. Dependencies should be installed in images, not on host.

## Definition of Done
HTTP and Compose validation plus focused regression tests, with limitations recorded.
