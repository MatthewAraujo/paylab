# T3 Context

## Task
[T3](../tasks/T3.md): `compose.production.yaml` starting PostgreSQL, the initializer, the API and the console from the T1/T2 images. It covers an isolated project and volumes, loopback ports, healthchecks, ordering, a required gitignored `.env.production` with a tracked example, and a repeatable smoke script.

## Related PRD Acceptance Criteria
AC-2, AC-3, AC-4, AC-7, AC-10, AC-12, AC-13.

## Relevant Prior Summaries
- [T1](T1-summary.md): `paylab-api/Dockerfile.production` has `runtime` and `init` targets. The runtime needs `DATABASE_URL` and `FRONTEND_URL`. The initializer runs as `node`, owns `/run/paylab`, and its guard requires host `postgres` and database `paylab_demo`. Authenticated reads use `GET /v1/accounts` with a Bearer key.
- [T2](T2-summary.md): `paylab-ui/Dockerfile.production` runs `node server.js` as `node`. At runtime it needs `PAYLAB_API_KEY` and `PAYLAB_INTERNAL_API_URL`. `/` returns 307.

## Files Likely Affected
New `compose.production.yaml`, `.env.production.example` and `scripts/check-production-stack.py`; root `.gitignore`. The root `.gitignore` has unrelated uncommitted user lines; stage only this task's lines.

## Test-First Plan
- AC-2: both configs validate; loopback-only ports; no PostgreSQL port.
- AC-3: project `paylab-production` with its own volumes.
- AC-4: first startup seeds; authenticated API read; console renders Wallet data.
- AC-7: the initializer migrates before the API starts.
- AC-10: all three services report healthy, and the console starts after a healthy API.
- AC-12: the key is absent from the HTML, the credential mount is read-only, and the key is absent from tracked files and image config.
- AC-13: a missing env file fails before any container starts; `.env.production` is ignored; the example has safe values only.

## Constraints
The development stack (`paylab-local`) uses the same ports; stop it before starting this stack, and never remove its volumes. The smoke script must never print the key or remove volumes.

## Risks
Docker sets `HOSTNAME` in containers; the console must still bind 0.0.0.0. The password must be URL-encoded in `DATABASE_URL`.

## Definition of Done
The stack reaches healthy from empty volumes, the smoke script passes, and the missing-env-file failure is recorded.
