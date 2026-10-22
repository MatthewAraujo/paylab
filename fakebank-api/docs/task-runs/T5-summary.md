# T5 Summary

## Status

done

## What Changed

`GET /v1/transactions?externalReference=<ref>` lists every Provider Transaction of the authenticated Client that carries the External Reference. It returns `200 { data: [...] }`, oldest first, with each item in the T3 representation. An unknown reference gives `data: []`. Another Client's transactions are never included. A missing, empty, blank, too long (over 128) or repeated `externalReference` is `400 VALIDATION_ERROR`, and a missing key is `401`. The route is documented in `/docs`.

## Files Changed

- `src/infra/transactions/provider-transaction.repository.ts`: `listByExternalReference(clientId, externalReference)`.
- `src/infra/transactions/transaction.schemas.ts`: the External Reference rule is extracted and shared by the creation body and the new `listByExternalReferenceQuery`.
- `src/infra/transactions/provider-transaction.representation.ts`: `ProviderTransactionListResponse` (OpenAPI shape `{ data: ProviderTransactionResponse[] }`).
- `src/infra/transactions/transactions.controller.ts`: `@Get()` handler with `@ApiQuery`, `200`, `400` (`ErrorEnvelopeResponse`) and the controller-level `401`.
- `test/e2e/lookup-by-external-reference.e2e-spec.ts` (new), `test/e2e/docs.e2e-spec.ts`.
- `docs/task-runs/T5-CONTEXT.md`, this summary.

## Tests Added or Updated

- e2e `lookup-by-external-reference`: single match equals the creation body; two transactions under different Idempotency Keys are both returned, oldest first, with another reference excluded; unknown reference gives an empty list; Client scoping in both directions; `400` table (missing, empty, blank, 129 characters, repeated parameter); `401` without a key.
- e2e `docs`: the route documents `200`/`400`/`401`, a required `externalReference` query parameter, bearer security, the error envelope on `400`, and `ProviderTransactionListResponse.data` as an array of `ProviderTransactionResponse`.
- Mutation check: switching the query to newest-first without the Client filter turned the ordering and scoping tests red.

## Commands Run

`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`

## Validation Result

All green. Lint: 56 files, clean. Typecheck: clean. Unit: 24/24. e2e: 59/59 (6 files). Integration: 2/2. Concurrency: 2/2.

## Decisions Made

- **Order.** `created_at ASC, id ASC`. `id` is only a deterministic tiebreak for two creations in the same millisecond, because UUID v7 random bits do not order within one millisecond. Within one millisecond the order is stable but not guaranteed to be the creation order.
- **Validation matches creation.** The query uses the same External Reference rule as the body (1–128 characters, not blank, matched exactly without trimming). A repeated parameter arrives as an array and is a `400` ("Must be a single string"). Unknown query parameters are ignored.
- **No pagination** (as the spec says). No service `CONTEXT.md` entry was needed, because the task spec already records the limit.
- No new service: the controller calls the repository directly, as the T3 read by id does.

## Follow-up Needed

- `PROJECT.md` (lane B owns it): if it lists routes or curl examples, add `GET /v1/transactions?externalReference=<ref>` → `200 { data: [...] }` (oldest first, Client-scoped, `400 VALIDATION_ERROR` without the parameter).

## Context for Next Task

- **T6–T8.** `ProviderTransactionRepository.listByExternalReference(clientId, ref)` returns the current rows, so states set by T6 (`FAILED`, `PROCESSING` for `DEFERRED`) and advances by T7 appear in the list with no further work. The list uses `toProviderTransactionResponse`, so any representation change applies to all three reads.
- **Lab scenarios (T6).** Can reuse `listByExternalReferenceQuery`'s External Reference rule: export the `externalReference` schema from `transaction.schemas.ts` if the lab body needs the same constraints (it is module-private today).
- **AC-11-style tests.** A test that a double submission produces two transactions can assert through this endpoint.
