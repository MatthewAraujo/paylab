# T5 Summary

## Status

done

## What Changed

Added the pure PayLab domain under `src/domain/paylab/`: `Amount` value object, `Account` entity (WALLET / EXTERNAL_CLEARING, BRL only), `Payment` aggregate with the CREATED -> PROCESSING -> SUCCEEDED / FAILED state machine, domain errors, and abstract ports (`AccountsRepository`, `PaymentsRepository`, `SettlementPort`).

## Files Changed

- `src/domain/paylab/enterprise/entities/value-objects/amount.ts`
- `src/domain/paylab/enterprise/entities/account.ts`
- `src/domain/paylab/enterprise/entities/payment.ts`
- `src/domain/paylab/enterprise/errors/*.ts` (invalid-amount, invalid-account, unsupported-currency, invalid-payment, invalid-payment-transition)
- `src/domain/paylab/application/repositories/{accounts-repository,payments-repository,settlement-port}.ts`
- `test/domain/paylab/enterprise/entities/{account,payment}.spec.ts`, `.../value-objects/amount.spec.ts`

## Tests Added or Updated

27 unit tests (Amount 11, Account 5, Payment 11), written first and seen failing (module not found) before implementation.

## Commands Run

`pnpm test` (13 files, 59 tests green), `pnpm typecheck`, `pnpm lint`.

## Validation Result

All green; no database, no Nest container.

## Decisions Made

- Amount is a `number` restricted to safe integers (max 2^53-1 centavos). `ValueObject.equals` is overridden because JSON.stringify cannot serialize bigint and to compare by value. The Prisma `BigInt` <-> `number` conversion belongs to one infra mapper (T6); it must reject values beyond the safe range.
- Amount is currency-less; the Payment's currency comes from its Accounts (must match, BRL only via `Account.create`).
- `Account.create` / `Payment.create` validate and return `Either`; `Account.restore` / `Payment.restore` rebuild persisted state without validation for repositories.
- Payment stores `sourceAccountKind` so `isBalanceConsumer()` needs no repository lookup.
- `Payment.succeed(ledgerTransactionId?)` records the Ledger Transaction reference; failure reason type is `'INSUFFICIENT_FUNDS'` only.
- `AccountsRepository.getBalance` returns a plain `number` (a Balance can be zero, so it is not an Amount).

## Follow-up Needed

T6 implements `SettlementPort` and the infra mapper; port signatures may be adjusted there if raw-SQL Settlement needs a different shape (e.g. transaction context).

## Context for Next Task

Domain lives in `src/domain/paylab`. Entities are built with `create` (validated) or `restore` (from DB). Expected failures are returned as `Either`.
