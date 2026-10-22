# T3 Summary

## Status

done

## What Changed

First tracer bullet through every layer. Authenticated Clients can create a Provider Transaction that succeeds immediately (`POST /v1/transactions` → `201`) and read it back by id (`GET /v1/transactions/:providerTransactionId`). The transaction and its two events (`transaction.processing`, `transaction.succeeded`) are written in one database transaction through the T2 state machine. Clients are configured as `FAKEBANK_CLIENTS=clientId:sha256-hex` and authenticated by a constant-time hash comparison. The new migration creates `provider_transaction` and an append-only `provider_transaction_event`, which triggers enforce. Both endpoints are in `/docs`.

## Files Changed

- Env: `src/infra/env/env.ts` (`FAKEBANK_CLIENTS` → `ClientCredential[]`), `.env.example` (public fake dev key + hash).
- Auth (new): `src/infra/auth/{api-key,authenticated-client,client-auth.guard}.ts`.
- HTTP: `src/infra/http/zod-validation.pipe.ts` (new, `400 VALIDATION_ERROR`).
- Transactions (new): `src/infra/transactions/{transactions.module,transactions.controller,create-provider-transaction.service,provider-transaction.repository,provider-transaction.representation,transaction.schemas,provider-transaction-id,domain-clock}.ts`; `src/infra/app.module.ts` imports `TransactionsModule`.
- Schema: `prisma/migrations/20261022000000_provider_transactions/migration.sql`, `prisma/schema.prisma`.
- Script: `scripts/hash-client-key.mjs`, `package.json` script `client-key:hash`.
- Tests: `test/support/clients.ts` (new), `test/support/setup-env.ts`, `test/infra/env.spec.ts`, `test/e2e/transactions.e2e-spec.ts` (new), `test/e2e/docs.e2e-spec.ts`, `test/integration/provider-transaction-event.spec.ts` (new).
- Docs: `PROJECT.md` (structure, command, env var, conventions, curl example), `docs/task-runs/T3-CONTEXT.md`, this summary.

## Tests Added or Updated

- Unit `test/infra/env.spec.ts` (AC-34): valid list parsed and lowercased into `{ clientId, keyHash }`. Boot refused, naming `FAKEBANK_CLIENTS`, when it is missing or empty, an entry has no hash, a plaintext key is given, a hash is short or non-hex, a client id is empty, or a client id or hash is duplicated.
- E2E `test/e2e/transactions.e2e-spec.ts` (32 cases):
  - AC-1: `201` with the exact representation, an id matching `FBK-` + UUID v7, and an integer Amount.
  - AC-27: events `processing` then `succeeded` in order; the terminal event's `occurredAt` equals `completedAt`.
  - AC-9: no header, a `Basic` scheme, an empty Bearer, an unknown key, or the configured hash sent as the key → `401 UNAUTHORIZED` envelope on POST (nothing persisted) and on GET.
  - AC-34: the second configured Client authenticates as itself.
  - AC-3: 12 invalid bodies → `400 VALIDATION_ERROR` with nothing persisted: missing fields, `0`, negative, `10.5`, `"1500"`, `2^53`, empty, blank, 129 characters, malformed currency. A 128-character reference is accepted. A missing, empty or 256-character `Idempotency-Key` → `400`. `USD` → `422 UNSUPPORTED_CURRENCY` with nothing persisted.
  - AC-7: GET equals the creation body; an unknown id, a malformed id or another Client's id → `404 TRANSACTION_NOT_FOUND`.
- E2E `docs.e2e-spec.ts` (AC-12): POST documents `201/400/401/422`, the `Idempotency-Key` header and bearer security; GET documents `200/401/404`; the errors reference `ErrorEnvelopeResponse`.
- Integration `test/integration/provider-transaction-event.spec.ts` (AC-28): direct SQL `UPDATE` and `DELETE` are rejected and the row is unchanged.

TDD note: the env tests, the AC-1 e2e test and the docs test were watched red first. The implementation behind AC-1 was written as one slice, so the remaining e2e cases and the trigger test went green on their first run. To prove they catch the bugs they name, I ran mutations, and each one turned its test red:

- events stored in reversed order;
- currency check removed;
- client scoping removed from the read;
- auth guard bypassed (10 failures);
- `.safe()` removed from the Amount schema;
- triggers removed from the migration (both integration tests failed);
- the `401` response documentation removed.

## Commands Run

`pnpm prisma:generate`, `pnpm test`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm test:concurrency`, `pnpm biome check --write .`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm client-key:hash` (argv and stdin).

## Validation Result

- `pnpm lint`: pass (52 files).
- `pnpm typecheck`: pass.
- `pnpm test`: 2 files, 24 tests pass (T2's 14 unchanged).
- `pnpm test:e2e`: 4 files, 42 tests pass (T1's 7 unchanged, plus 1 new docs test).
- `pnpm test:integration`: 1 file, 2 tests pass.
- `pnpm test:concurrency`: no files, exit 0.
- `pnpm build`: emits `dist/infra/main.js`.

## Decisions Made

- **Client config.** `FAKEBANK_CLIENTS` is required. Client ids match `[A-Za-z0-9_-]{1,64}`. Hashes are 64 hex characters, normalized to lowercase. Duplicated ids or hashes refuse the boot, because a duplicated hash would make the Client ambiguous. Error messages name the entry's position, never its value, so a pasted plaintext key never reaches logs.
- **Auth.** `ClientAuthGuard` accepts only `Authorization: Bearer <printable ASCII>`. It compares the SHA-256 digest with every configured hash using `timingSafeEqual` and does not stop at the first match. Every failure gives the same `401 UNAUTHORIZED`. The guard sets `request.client`, which `@CurrentClient()` reads. Guards run before pipes, so a request without a valid key always gets `401`, even when its body is invalid.
- **Validation.** Body shape problems and a missing or invalid `Idempotency-Key` are `400 VALIDATION_ERROR`, checked through `ZodValidationPipe`, which names the fields. `currency` must match `^[A-Z]{3}$` to count as well formed. A well-formed currency other than BRL is `422 UNSUPPORTED_CURRENCY`, decided in the creation service before anything is persisted. A blank External Reference is a `400`. The External Reference is stored exactly as sent, without trimming. Unknown body fields are stripped.
- **Ids.** `FBK-` + UUID v7 comes from a small local generator (`provider-transaction-id.ts`), because Node 22 has no built-in v7 and one function does not justify a dependency. Event ids are UUID v4 (`randomUUID`) from the `systemClock` DomainClock, which is injected under the `DOMAIN_CLOCK` token.
- **Request fingerprint.** SHA-256 hex of `JSON.stringify([externalReference, amountMinor, currency])`, stored in `request_fingerprint` (`requestFingerprint()` is exported from the creation service for T4).
- **Schema.**
  - Statuses and event types are `TEXT` columns with `CHECK` constraints, not PostgreSQL enums.
  - Further `CHECK` constraints: Amount `> 0`; `failure_code` is set exactly when the status is `FAILED`; `completed_at` is set exactly when the status is terminal.
  - Events carry an extra column the PRD does not list, `sequence BIGINT GENERATED ALWAYS AS IDENTITY`, because both events of an immediate success can share one millisecond. Order events by `sequence`, not `occurred_at`.
  - The event foreign key is `ON DELETE RESTRICT`.
  - Triggers reject `UPDATE` and `DELETE` with SQLSTATE `restrict_violation` and a message containing "append-only". `TRUNCATE` (the test reset) is not blocked.
- **Representation.** `amountMinor` is converted with `Number(bigint)`, which is safe because the schema enforces `.safe()`. Timestamps are ISO-8601 with milliseconds. `updatedAt` is `completedAt ?? createdAt` on creation.
- **Not mapped.** `FAILURE_CODE_REQUIRED` cannot arise in T3 because only `SUCCEEDED` is requested, so it gets no HTTP mapping. An impossible refusal of the immediate success throws, which becomes a `500`.

## Follow-up Needed

None for T3. T4 owns replay and conflict on `(client_id, idempotency_key)`. Today a reused key surfaces as a Prisma unique-constraint error, which becomes a generic `500`.

## Context for Next Task

- **Routes.**
  - `POST /v1/transactions`: headers `Authorization: Bearer <key>` and `Idempotency-Key` (1–255 characters); body `{ externalReference, amountMinor, currency }`; answers `201`.
  - `GET /v1/transactions/:providerTransactionId`: answers `200`, or `404 TRANSACTION_NOT_FOUND`.
  - Both return `{ providerTransactionId, externalReference, status, amountMinor, currency, failureCode, createdAt, updatedAt, completedAt }` (`ProviderTransactionResponse` / `toProviderTransactionResponse(row)`).
- **Creation seam (T4/T5/T6/T8).** `CreateProviderTransactionService.execute({ clientId, idempotencyKey, externalReference, amountMinor, currency })` in `src/infra/transactions/create-provider-transaction.service.ts`. It returns the Prisma `ProviderTransaction` row, and the controller always answers `201`.
  - T4: add the insert-or-load-on-conflict step and fingerprint comparison here. The controller needs a dynamic status (`200` plus `Idempotent-Replayed`), e.g. via `@Res({ passthrough: true })`.
  - T5/T6: consume the scenario before persistence (pre-commit Outcomes), choose the transition (`SUCCEEDED` / `FAILED` + Failure Code / none for `DEFERRED`), and set `appliedOutcome`. `FAILURE_CODE_REQUIRED` then needs a mapping, or a guarantee that it is validated earlier.
- **Persistence.** `ProviderTransactionRepository.insertWithEvents(row, events)` writes one Prisma interactive transaction and inserts events one by one in array order. `findForClient(clientId, id)` scopes reads by Client. T8 (list by External Reference) uses the `(client_id, external_reference, created_at)` index.
- **Auth for later controllers** (lab included, AC-9): `@UseGuards(ClientAuthGuard)` and `@CurrentClient() client: AuthenticatedClient`; register `ClientAuthGuard` as a provider in the module (it depends only on the global `EnvService`).
- **Tests authenticate** with `bearer(TEST_CLIENTS.paylab)` or `bearer(TEST_CLIENTS.other)` (client ids `paylab`, `other-client`) from `test/support/clients.ts`. `setup-env.ts` always sets `FAKEBANK_CLIENTS` to their hashes and overrides any developer value.
- **T9 (Docker/docs).**
  - Migrations are applied with `pnpm prisma:migrate:deploy` (`prisma migrate deploy`).
  - Required env: `DATABASE_URL` and `FAKEBANK_CLIENTS`. Optional: `PORT` (default 4000), `NODE_ENV`, `APP_NAME`, `LOG_ENABLED`, `LOG_LEVEL`; T6 adds `FAKEBANK_LAB_ENABLED`.
  - Development Client: key `fakebank-dev-key-paylab-not-a-secret` (public and fake), configured as `FAKEBANK_CLIENTS=paylab:5489e8238a869fd3a7d6c634818fca30656b25435dd903860d123236437a576a`, as in `.env.example`. Compose files should use the same values and document the key. Any other environment generates a random key and hashes it with `pnpm client-key:hash` (stdin keeps the key out of shell history).
