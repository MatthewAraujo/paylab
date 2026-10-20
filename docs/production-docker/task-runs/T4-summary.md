# T4 Summary

## Status
Completed. AC-5, AC-6 and AC-11, plus the AC-7 failure path, are validated.

## What Changed
The `--kill` check in `scripts/check-production-stack.py` now kills the direct child of `docker-init` (PID 1), read from `/proc/1/task/1/children`. The slim images have no `pgrep`/`pidof`, and Node 24 reports its process name as `MainThread`, so name-based lookups fail. The exit status of the `exec` session is ignored, because the session dies with the container; recovery is asserted through `RestartCount` and health. No Compose changes were needed: the restart policies declared in T3 are correct.

## Files Changed
`scripts/check-production-stack.py`, this run record and the plan index.

## Tests Added or Updated
- `--kill` (validated): api and ui are each killed, restarted by Docker (RestartCount incremented) and healthy again.
- `--restart` (validated): stop/start keeps Wallet ids and the credential, and `demo-init` logs `Existing demo data and credential preserved.`
- Across `up --build`: key hash and all 6 Wallet ids are identical before and after (scratchpad helper reusing the smoke script's functions; the key is never printed).

## Commands Run
- `python3 scripts/check-production-stack.py --kill`. Two red runs first: `pgrep` is missing (`kill: Usage`), and the name match failed because of `MainThread`. One of those early attempts also restarted the API once; the final run then passed.
- `python3 scripts/check-production-stack.py --restart`, twice, around `docker compose -f compose.production.yaml up --build -d --wait`.
- `docker inspect` restart policies: postgres/api/ui are `unless-stopped`; `demo-init` has `no`.
- Throwaway projects (`paylab-t4-a|b|c`, no published ports, removed with `down -v` after listing their volumes):
  - **A**, seeded database with an overwritten credential: `demo-init` exit 1 with `The saved demo credential does not match the database`; API and console not started; Payments count 174 before and after.
  - **B**, credential present and database empty: `demo-init` exit 1 with `A demo credential exists but the database is empty. Restore the matching database volume; no data was changed.`; API and console only `created`, never started.
  - **C**, conflicting pre-existing `merchants` table: `prisma migrate deploy` fails with `P3005`; `demo-init` exit 1; API and console only `created`.

## Validation Result
All checks pass. `paylab-production` and `paylab-local` volumes are untouched; the production-local stack is running and healthy again.

## Decisions Made
No watchdog for merely unhealthy containers; Docker restarts only exited ones (documented in T5).

## Follow-up Needed
None.

## Context for Next Task
The stack is running with 6 Wallets and 174 Payments. Backups go to gitignored `backups/`. Restore must stop api and ui first and keep the credential volume.
