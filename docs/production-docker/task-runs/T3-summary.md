# T3 Summary

## Status
Completed. AC-2, AC-3, AC-4, AC-7 (ordering), AC-10, AC-12 and AC-13 are validated against the running stack.

## What Changed
Added `compose.production.yaml` (project `paylab-production`). It runs PostgreSQL 16, the one-shot `demo-init` (migrations, then the unchanged demo initializer), the API runtime and the console, built from the T1/T2 production Dockerfiles. API and console publish only on `127.0.0.1` (3333 and 3000); PostgreSQL publishes no port.

All three long-running services have healthchecks and `restart: unless-stopped`; `demo-init` has no restart policy. Startup order:
- `demo-init` waits for a healthy PostgreSQL;
- the API waits for `demo-init` to complete successfully;
- the console waits for a healthy API.

The console reads the key from the read-only credential volume and exports it only to its server process.

Real values come from a required, gitignored `.env.production`, documented by a tracked `.env.production.example` that holds only example values. `backups/` is gitignored. Added `scripts/check-production-stack.py`, following the precedent of `check-docker-reload.py`.

## Files Changed
`compose.production.yaml`, `.env.production.example`, `scripts/check-production-stack.py` (new); root `.gitignore` (only this task's lines; unrelated uncommitted user lines stay unstaged); this run record and the plan index.

## Tests Added or Updated
`scripts/check-production-stack.py` checks:
- health and successful initializer completion;
- the exact published ports;
- project and volume isolation;
- non-root api/ui processes with no pnpm, compilers or source;
- an authenticated `GET /v1/accounts`;
- that `/accounts` renders the Demo Store Wallet ids;
- that the key is absent from the HTML;
- that the credential mount is read-only.

The `--restart` and `--kill` flags are written now and validated in T4.

## Commands Run
- `docker compose -f compose.production.yaml config --quiet` without `.env.production`: exit 1, `env file /home/matthewaraujo/personal/paylab/.env.production not found`.
- `docker compose config --quiet` (development): passes.
- `git check-ignore -v .env.production backups/x`: both ignored.
- `docker compose -f compose.production.yaml up --build -d --wait`: all services healthy; `demo-init` applied three migrations and seeded 174 Payments.
- `python3 scripts/check-production-stack.py`: 5/5 PASS. The first run failed on the response shape (`items`, not `data`), which was fixed in the script.
- Leak checks for the Merchant key and the PostgreSQL password across tracked HEAD and the worktree, `docker history`/`inspect` of the three images, console container config, `.next/static` and `server.js`: none found.

## Validation Result
All checks pass. Development volumes `paylab-local_postgres-data` and `paylab-local_demo-credentials` remain present and untouched.

## Decisions Made
- `POSTGRES_DB=paylab_demo` is fixed in Compose because the initializer guard requires it; only the user, password and URL are in the env file.
- `HOSTNAME=0.0.0.0` is set explicitly on the console because Docker otherwise sets `HOSTNAME` to the container id.
- The env file is loaded into postgres, `demo-init` and the API only; the console needs no secrets beyond the volume.

## Follow-up Needed
None in scope. The local `.env.production` was generated with a random password (mode 600, gitignored).

## Context for Next Task
The stack is running and healthy with seeded data. Failure modes must use a throwaway project name and volumes. The `--kill` check relies on `pgrep`/`pidof`, which may be missing from slim images; verify it in T4.
