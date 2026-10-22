# T4 Context

## Task

[T4 — Idempotency](../tasks/T4.md). Make `POST /v1/transactions` idempotent per Client and Idempotency Key: the header is required, a replay returns the current state, conflicting reuse is rejected, and concurrent duplicates create one Provider Transaction.

## Related PRD Acceptance Criteria

- AC-2: a missing `Idempotency-Key` → `400`, nothing persisted.
- AC-4: same key and same body → `200`, `Idempotent-Replayed: true`, same `providerTransactionId`, current status, no second row.
- AC-5: same key with a different External Reference, Amount or currency → `409 IDEMPOTENCY_KEY_REUSED`, original unchanged.
- AC-6: two Clients with the same key each get their own Provider Transaction.
- AC-31: N parallel identical requests → one row, one pair of events, the same id in every response.
- Contributes to AC-12: document `200` replay, `409` and `Idempotent-Replayed`.

## Relevant Prior Summaries

- T3: creation seam is `CreateProviderTransactionService.execute(command)`; it computes the final state with the T2 state machine and calls `ProviderTransactionRepository.insertWithEvents(row, events)` (one Prisma interactive transaction). `requestFingerprint()` (SHA-256 of `[externalReference, amountMinor, currency]`) is stored in `request_fingerprint`. The unique index `provider_transaction_client_id_idempotency_key_key` exists on `(client_id, idempotency_key)`. A reused key surfaces today as a Prisma `P2002`, i.e. a generic `500`. AC-2 header validation (missing, empty, 256 chars → `400`, nothing persisted) already exists and is tested.
- Tests: `bearer(TEST_CLIENTS.paylab|other)`, `prisma` and `resetDatabase` in `test/support`; events ordered by `sequence`.

## Files Likely Affected

- `src/infra/transactions/create-provider-transaction.service.ts` — insert, on unique violation load and compare fingerprints; return `{ transaction, replayed }`.
- `src/infra/transactions/provider-transaction.repository.ts` — detect the `(client_id, idempotency_key)` violation, `findByIdempotencyKey`.
- `src/infra/transactions/transactions.controller.ts` — dynamic `201`/`200` and the `Idempotent-Replayed` header; OpenAPI `200`/`409`.
- `test/e2e/transactions.e2e-spec.ts` (or a new `test/e2e/idempotency.e2e-spec.ts`), `test/e2e/docs.e2e-spec.ts`.
- `test/concurrency/idempotency.spec.ts` (new) and a small helper firing parallel requests against a listening server.

## Test-First Plan

- AC-4 replay → `200` + header, same id, one row, two events → e2e (red today: `500`).
- AC-4 replay after a direct SQL status change → returns the new status → e2e.
- AC-5 different External Reference / Amount → `409 IDEMPOTENCY_KEY_REUSED`, original row and events unchanged → e2e.
- AC-6 two Clients, same key → distinct ids; each replay returns its own → e2e.
- AC-12 docs → POST documents `200`, `409` and the `Idempotent-Replayed` header → e2e.
- AC-31 20 parallel identical → one row, two events, one `201` and nineteen `200` with one id → concurrency.
- AC-31 parallel same key with different bodies → one row, the others `409` → concurrency.
- AC-2 already covered by T3's tests; keep them green.

## Constraints

- The unique constraint is the only arbiter: no lock-then-check, no pre-insert lookup.
- The replay response is built from the current row, never from a stored body.
- Leave one clear place before the insert where T6/T8 hook pre-persistence Outcomes; replay must skip post-commit behavior (delay, scenario consumption).
- Lane mode: do not touch Docker/compose files, `PROJECT.md`, `docs/TASKS.md`, the PRD, or task specs.

## Risks

- The PRD pipeline validates (including the `422` currency check) before the idempotency step, and BRL is the only supported currency, so a reused key with a different currency is answered `422`, not `409`. The currency branch of AC-5 is unreachable over HTTP in October; the test asserts the `422` and that the original is unchanged. Flag in the summary.
- A unique violation inside a Prisma interactive transaction aborts it; the existing row must be loaded after the rollback, outside it.
- Parallel tests need a wide connection pool and a listening server (`app.listen(0)`), as in `paylab-api`.

## Definition of Done

All tests above pass; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency` is green; T4-summary.md written; one commit with only T4 paths.
