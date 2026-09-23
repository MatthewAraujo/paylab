# T7 Context

## Task

Provision Merchants and API keys by script and authenticate requests by API key, resolving the current Merchant for scoping. Spec: `docs/tasks/T7.md`.

## Related PRD Acceptance Criteria

US-1, US-2, US-3 (provisioning, hashed key shown once, clearing Account untouched), US-5, US-6, US-7 (scoping mechanism), US-8 (foundation).

## Relevant Prior Summaries

- T1: technical spine, Zod pipes, error translation, logging interceptor (logs body/query/params only, never headers).
- T3: `merchants` and `merchant_api_keys` tables (unique `key_hash`, nullable `revoked_at`); the External Clearing Account is seeded by the baseline migration.

## Files Likely Affected

`scripts/provision-merchant.ts`, `src/domain/paylab/application/{services,repositories,use-cases}/`, `src/domain/paylab/enterprise/entities/merchant.ts`, `src/infra/database/repositories/`, `src/infra/auth/`, `src/infra/app.module.ts` (one import), `package.json` (one script), tests under `test/`.

## Test-First Plan

- Unit: key prefix and entropy, deterministic hash, hash differs from key, constant-time helper, authenticate use case.
- Integration: only the hash is stored, lookup by hash, unknown hash, cross-Merchant isolation, revoked key, script run twice.
- E2E through a temporary protected route: no key, invalid key, non-bearer scheme, valid key, Merchant A vs B.

## Constraints

Never log or store the raw key or its hash in logs; constant-time hash comparison; fast hash (not a password hash); no sessions or roles; do not edit `docs/TASKS.md`.

## Risks

Guard is opt-in per controller (`@UseGuards(ApiKeyGuard)`), so a route added without it is public.

## Definition of Done

Provisioning yields a working key, guard tests pass, no raw key in the database or logs; typecheck, lint and all test layers green.
