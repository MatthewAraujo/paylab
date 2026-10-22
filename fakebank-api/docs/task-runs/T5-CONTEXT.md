# T5 Context

## Task

Lookup by External Reference: `GET /v1/transactions?externalReference=<ref>` returns `{ data: [...] }`, holding every Provider Transaction of the authenticated Client that carries the External Reference, oldest first, each in the standard T3 representation. Spec: `docs/tasks/T5.md`.

## Related PRD Acceptance Criteria

- AC-8: `200` with every transaction of the calling Client carrying the reference, oldest first, including two created with different Idempotency Keys; no match gives `200` with an empty list; another Client's transactions are never included.
- AC-9: a missing or unknown key gives `401 UNAUTHORIZED` (inherited from the controller-level `ClientAuthGuard`).

## Relevant Prior Summaries

- T3: `ClientAuthGuard` + `@CurrentClient()`, `ZodValidationPipe` (`400 VALIDATION_ERROR`), `toProviderTransactionResponse(row)`, the index `(client_id, external_reference, created_at)`, and `ProviderTransactionRepository`. Tests authenticate with `bearer(TEST_CLIENTS.paylab|other)`.
- T4: creation seam returns `{ kind, transaction }`; no impact on reads.

## Files Likely Affected

- `src/infra/transactions/transactions.controller.ts`: new `@Get()` handler with Swagger decorators.
- `src/infra/transactions/provider-transaction.repository.ts`: `listByExternalReference(clientId, externalReference)`.
- `src/infra/transactions/transaction.schemas.ts`: query schema.
- `src/infra/transactions/provider-transaction.representation.ts`: `ProviderTransactionListResponse` for OpenAPI.
- `test/e2e/lookup-by-external-reference.e2e-spec.ts` (new), `test/e2e/docs.e2e-spec.ts`.

## Test-First Plan

All e2e through HTTP, one vertical slice at a time:

1. One transaction for `PAY-1` → `200 { data: [<same body as creation>] }` (catches field drift from the by-id read).
2. Two transactions for `PAY-1` with different Idempotency Keys → both, oldest first (catches deduplication, unstable order).
3. Unknown reference → `200 { data: [] }` (catches a `404`).
4. Another Client with the same reference → not included (catches cross-Client leak).
5. Missing, empty or blank `externalReference` → `400 VALIDATION_ERROR` (catches listing everything).
6. No key → `401` (AC-9).
7. `/docs-json` documents the route with `200`, `400`, `401` and the error envelope.

## Constraints

- External Reference is not unique; no deduplication (`CONTEXT.md`).
- Same validation as on creation for the reference (1–128 chars, not blank), stored and matched exactly as sent.
- No pagination in October.
- Lane mode: do not touch `docs/TASKS.md`, the PRD, task specs, PROJECT.md or lane B's Docker files.

## Risks

- Two creations in the same millisecond share `created_at`; ties are broken by `id` to keep the order deterministic (UUID v7 random bits do not order within one millisecond).
- A repeated query parameter arrives as an array; it must be a `400`, not a crash.

## Definition of Done

Tests above green; full gate green (`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`); `/docs` documents the endpoint; summary written; one commit with explicit paths.
