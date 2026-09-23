# T7 Summary

## Status

done

## What Changed

- Key handling (`services/api-key.ts`): `pk_` prefix plus 32 random bytes as base64url, plain SHA-256 hex hash, `timingSafeEqual` hash comparison (length-safe).
- Use cases: `ProvisionMerchantUseCase` (creates the Merchant and the key hash atomically, returns the raw key once) and `AuthenticateMerchantUseCase` (hash lookup, rejects unknown, revoked and empty keys, constant-time check).
- Ports: `MerchantsRepository.createWithApiKey`, `ApiKeysRepository.findByKeyHash`; Prisma implementations (nested create = one transaction).
- Infra: `AuthModule`, `ApiKeyGuard` (`Authorization: Bearer <key>`, one generic 401 for every failure), `@CurrentMerchant()` decorator (`{ id }`).
- Script `scripts/provision-merchant.ts` with `pnpm merchant:provision <name>`; prints the key once.
- `Merchant` entity.

## Files Changed

`scripts/provision-merchant.ts`, `package.json` (one script line), `src/infra/app.module.ts` (import `AuthModule`), `src/infra/auth/*`, `src/infra/database/repositories/prisma-{merchants,api-keys}-repository.ts`, `src/domain/paylab/application/{services/api-key.ts, repositories/{merchants,api-keys}-repository.ts, use-cases/{provision-merchant,authenticate-merchant}.ts, use-cases/errors/invalid-api-key-error.ts}`, `src/domain/paylab/enterprise/entities/merchant.ts`, tests below, `docs/task-runs/T7-*.md`.

## Tests Added or Updated

- `test/domain/paylab/application/services/api-key.spec.ts` (5), `.../use-cases/authenticate-merchant.spec.ts` (4).
- `test/integration/merchant-api-keys.spec.ts` (7, includes the script run twice and no-name refusal).
- `test/e2e/api-key-auth.e2e-spec.ts` (5, temporary `/probe` route in a test-only module).
Written first and observed red (missing modules) before implementation.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (69 passed), `pnpm test:integration` (42 passed), `pnpm test:e2e` (6 passed), `pnpm test:concurrency` (1 passed), `pnpm merchant:provision` with no args (usage, exit 1).

## Validation Result

All green.

## Decisions Made

- Bearer header rather than a custom header; the guard is opt-in per controller, so `/health` stays public without touching `HealthController`.
- Plain SHA-256 for high-entropy keys; the DB lookup is by hash, then the hash is compared in constant time.
- The script logic is an exported function (`provisionMerchant`) so it is tested in-process; `require.main` guard runs it as a CLI.
- No raw key or hash is logged; the logging interceptor never records headers.

## Follow-up Needed

T8 and T9 controllers must apply `@UseGuards(ApiKeyGuard)` and import `AuthModule`. Key revocation has no tooling yet (out of scope).

## Context for Next Task

Use `@CurrentMerchant()` (`{ id }`) for every Merchant-scoped read; a request touching another Merchant's Account must return the same not-found as a nonexistent one.
