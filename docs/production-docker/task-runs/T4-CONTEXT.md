# T4 Context

## Task
[T4](../tasks/T4.md): prove the production-local stack's data/credential preservation, restart recovery and explicit failure behavior.

## Related PRD Acceptance Criteria
AC-5, AC-6, AC-11; AC-7 failure path.

## Relevant Prior Summaries
[T3](T3-summary.md): the stack is running with 6 Demo Store Wallets. `scripts/check-production-stack.py` already has `--restart` and `--kill`, which are not yet validated. Restart policies are declared (`unless-stopped` on postgres/api/ui; none on `demo-init`). The `--kill` check may depend on `pgrep`/`pidof`, which the slim images may not have.

## Files Likely Affected
`scripts/check-production-stack.py`; `compose.production.yaml` only if a policy is wrong.

## Test-First Plan
- AC-5: `--restart` keeps the Wallet ids and the credential, and `demo-init` logs preservation; also checked after `up --build`.
- AC-11: `--kill` shows Docker restarting api and ui to healthy; `demo-init` has no restart policy.
- AC-6: a throwaway project with mismatched volumes makes `demo-init` fail, the API and console are never created or started, and the data is unchanged.
- AC-7 (failure path): a throwaway project whose migration fails keeps the API and console down.

## Constraints
Throwaway project names prefixed `paylab-t4-`, using a separate env file in the scratchpad and an override that drops the published ports. Remove only the throwaway volumes, after listing them. Never touch `paylab-production` or `paylab-local` volumes.

## Risks
A throwaway run on the same host ports would conflict with the running stack, so throwaway runs publish no ports.

## Definition of Done
The opt-in smoke checks pass and the manual failure evidence is recorded.
