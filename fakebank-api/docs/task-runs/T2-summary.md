# T2 Summary

## Status

done

## What Changed

Added a pure Provider Transaction state machine (no Nest, Prisma or `paylab-api` imports). Creation always yields `PROCESSING` with one `transaction.processing` event; the only allowed transitions are `PROCESSING → SUCCEEDED` and `PROCESSING → FAILED` (Failure Code required), each setting `completedAt` and producing one terminal event. Every other transition returns a typed `INVALID_TRANSITION` result and produces no event. Event ids and timestamps come from an injected `DomainClock`.

## Files Changed

- `src/domain/provider-transaction.ts` (new)
- `test/domain/provider-transaction.spec.ts` (new)
- `docs/task-runs/T2-CONTEXT.md`, this summary

## Tests Added or Updated

Unit `test/domain/provider-transaction.spec.ts` (14 cases):

- AC-27: creation → `PROCESSING`, `completedAt: null`, exactly one `transaction.processing` event with injected id and timestamp.
- AC-26: `PROCESSING → SUCCEEDED` → `completedAt` set, one `transaction.succeeded` event.
- AC-26: `PROCESSING → FAILED` → Failure Code on transaction and event, `transaction.failed`; a blank Failure Code → `FAILURE_CODE_REQUIRED`, no event id consumed.
- AC-26 (table): `SUCCEEDED → FAILED`, `FAILED → SUCCEEDED`, `SUCCEEDED → SUCCEEDED`, `FAILED → FAILED`, `PROCESSING → PROCESSING`, `SUCCEEDED → PROCESSING`, `FAILED → PROCESSING` → `INVALID_TRANSITION { from, to }`, no event id consumed.
- AC-27: creation then immediate success → events `transaction.processing` then `transaction.succeeded`, in clock order.

Every test was watched red before its implementation except the last (ordering), which went green on its first run: it composes the two already-built operations and stays as a guard on the AC-27 sequence that T3 relies on.

## Commands Run

- `pnpm test` (per cycle), `pnpm lint:fix`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`.

## Validation Result

- `pnpm lint`: pass (36 files).
- `pnpm typecheck`: pass.
- `pnpm test`: 2 files, 14 tests pass.
- `pnpm test:e2e`: 3 files, 7 tests pass (T1's suite unchanged).

## Decisions Made

- Refusals are values: `Result<T, E> = { ok: true; value } | { ok: false; error }`, never exceptions. Error union: `{ code: 'INVALID_TRANSITION', from, to }` | `{ code: 'FAILURE_CODE_REQUIRED' }`.
- `INVALID_TRANSITION` is checked before the Failure Code, so a terminal transaction is always refused as `INVALID_TRANSITION` whatever the payload.
- `ProviderTransactionTransition` accepts `{ to: 'PROCESSING' }` only so a caller (T7's advance endpoint) can pass a parsed target straight through and get the refusal.
- The Failure Code is trimmed; a blank one is refused. It stays a plain `string` (no closed list yet; the PRD only names examples).
- The module owns only status fields (`id`, `status`, `failureCode`, `createdAt`, `completedAt`). `transitionProviderTransaction` is generic over `T extends ProviderTransactionState`, so callers can pass a richer record (amount, External Reference, client) and get it back with the extra fields preserved.

## Follow-up Needed

None for T2.

## Context for Next Task

Module `@/domain/provider-transaction` exports:

- Types: `ProviderTransactionStatus`, `ProviderTransactionEventType`, `ProviderTransactionState`, `ProviderTransactionEvent` (`id`, `providerTransactionId`, `type`, `status`, `failureCode`, `occurredAt`), `DomainClock` (`now(): Date`, `newEventId(): string`), `ProviderTransactionChange<T>` (`{ transaction, event }`), `ProviderTransactionTransition`, `ProviderTransactionTransitionError`, `Result<T, E>`.
- `createProviderTransaction({ id }, clock)` → `{ transaction, event }`; `createdAt` and the event's `occurredAt` are the same `clock.now()`.
- `transitionProviderTransaction(current, transition, clock)` → `Result<{ transaction, event }, ProviderTransactionTransitionError>`; `completedAt` and `occurredAt` are the same `clock.now()`.

For T3: generate the transaction id yourself, call `createProviderTransaction`, merge the returned state with the request fields, and persist the transaction and the event in one database transaction; for an immediate decision, call `transitionProviderTransaction` on the result and persist its event in the same database transaction (events then come out in AC-27 order). Map the event's `type` and `failureCode` to the event table columns. For T7: map `INVALID_TRANSITION` to `409 INVALID_TRANSITION`.
