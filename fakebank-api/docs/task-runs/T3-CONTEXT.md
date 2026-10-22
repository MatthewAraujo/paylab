# T3 Context

## Task

[T3 — Create and read a Provider Transaction (immediate success)](../tasks/T3.md). First tracer bullet through every layer: an authenticated Client posts `POST /v1/transactions`, FakeBank persists a Provider Transaction that ends `SUCCEEDED` immediately, writes `transaction.processing` then `transaction.succeeded` in the same database transaction, and the Client reads it back with `GET /v1/transactions/:providerTransactionId`.

## Related PRD Acceptance Criteria

- AC-1: `201`, id `FBK-` + UUID (v7), External Reference/Amount/currency echoed, `SUCCEEDED`, `failureCode` null, `completedAt` set.
- AC-3: schema violations → `400 VALIDATION_ERROR`; non-BRL currency → `422 UNSUPPORTED_CURRENCY`; nothing persisted.
- AC-7: read by id → `200`; unknown or another Client's id → `404 TRANSACTION_NOT_FOUND`.
- AC-9: missing/malformed/unknown key → `401 UNAUTHORIZED` (both endpoints).
- AC-27 (immediate success): events `transaction.processing` then `transaction.succeeded`.
- AC-28: database rejects `UPDATE`/`DELETE` on events.
- AC-34: keys configured as SHA-256 hashes (`FAKEBANK_CLIENTS`), constant-time comparison.
- Contributes to AC-12: both endpoints, their status codes and the error shape in `/docs-json`.

## Relevant Prior Summaries

- T1: env via `envSchema`/`buildEnv` + `EnvService`; test placeholders in `test/support/setup-env.ts`; errors via `new HttpException({ code, message }, status)`; `ErrorEnvelopeResponse` for Swagger; hand-written migrations mirrored in `schema.prisma`; `buildTestApp`, `prisma` and `resetDatabase` (TRUNCATE, so delete triggers do not interfere) in `test/support`.
- T2: `@/domain/provider-transaction` — `createProviderTransaction({ id }, clock)` then `transitionProviderTransaction(tx, { to: 'SUCCEEDED' }, clock)`; persist both events in returned order. `FAILURE_CODE_REQUIRED` cannot arise in T3 (only `SUCCEEDED` is requested), so no HTTP mapping is added.

## Files Likely Affected

- `src/infra/env/env.ts` (+ `FAKEBANK_CLIENTS` parsing), `test/support/setup-env.ts`, `test/support/clients.ts` (test keys), `.env.example`.
- `src/infra/auth/` — API key hashing/comparison, `ClientAuthGuard`, `@CurrentClient()`.
- `scripts/hash-client-key.mjs` + `pnpm client-key:hash`.
- `prisma/migrations/20261022000000_provider_transactions/migration.sql`, `prisma/schema.prisma`.
- `src/infra/transactions/` — module, controller, Zod schemas + validation pipe, representation, creation service (the attempt pipeline seam), repository, id generator, clock provider.
- `src/infra/app.module.ts`.
- Tests: `test/infra/env.spec.ts`, `test/e2e/transactions.e2e-spec.ts`, `test/e2e/docs.e2e-spec.ts`, `test/integration/provider-transaction-event.spec.ts`.
- `PROJECT.md` (new env var, script, structure).

## Test-First Plan

Vertical slices, each red first:

1. Unit (env): malformed `FAKEBANK_CLIENTS` entry (no colon, non-hex/short hash, empty, duplicate client id) refused naming the variable; a valid list parses to `{ clientId, keyHash }`.
2. E2E AC-1: valid request → `201` with the full representation.
3. E2E AC-27: event table holds `transaction.processing` then `transaction.succeeded` for that id.
4. E2E AC-9: no header / malformed header / unknown key → `401 UNAUTHORIZED` envelope on POST and GET; nothing persisted.
5. E2E AC-3: table of invalid bodies and keys → `400 VALIDATION_ERROR`; `USD` → `422 UNSUPPORTED_CURRENCY`; row and event counts unchanged.
6. E2E AC-7: GET returns the creation representation; unknown id and another Client's id → `404 TRANSACTION_NOT_FOUND`.
7. Integration AC-28: direct SQL `UPDATE` and `DELETE` on `provider_transaction_event` fail.
8. E2E AC-12: `/docs-json` documents both paths with their status codes.

## Constraints

- Never import from `paylab-api`; prior art copied and trimmed only.
- Keys only as SHA-256 hex in config; `timingSafeEqual` over digests; never log keys. `.env.example` uses an obviously fake development key.
- Idempotency (replay/conflict) is T4: the key is validated and stored, tests always send a fresh key. Scenarios are T5/T6.
- Do not edit `docs/TASKS.md`, the dispatch file, the PRD or task specs.

## Risks

- Event order: both events can share a millisecond, so `occurred_at` alone cannot order them; an identity column records insertion order.
- `amountMinor` round trip: BigInt in the database, number in JSON; safe because the schema caps it at `Number.MAX_SAFE_INTEGER`.
- `FAKEBANK_CLIENTS` becomes required: every test layer and `.env.example` need a value, or boot fails.

## Definition of Done

All slices above green; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration` pass with T1/T2 tests unchanged and green; `T3-summary.md` written; one commit with explicit paths.
