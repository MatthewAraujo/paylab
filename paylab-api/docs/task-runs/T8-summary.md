# T8 Summary

## Status

done

## What Changed

- `CreateWalletUseCase` (always a BRL Wallet for the authenticated Merchant) and `GetAccountUseCase` (Wallet returned only to its owner; unknown, foreign and clearing Accounts share one not-found).
- `GetAccountBalanceUseCase` gained an optional `merchantId` scope and returns `currency` (additive; T6 callers unchanged).
- `AccountsController` at `v1/accounts` (`POST`, `GET :id`, `GET :id/balance`), guarded by `ApiKeyGuard`, with `AccountPresenter` and `AccountsModule`. Route ids are validated with Zod (malformed id is a validation error, not a lookup).
- The create endpoint reads no body, so a caller cannot ask for a clearing Account, another currency or another owner.
- `vitest.config.e2e.ts` now loads `setup-database.ts`, so e2e specs reset the database and run the global invariant check after each test.

## Files Changed

`src/domain/paylab/application/use-cases/{create-wallet,get-account,get-account-balance}.ts`, `src/infra/http/{accounts.module.ts,controllers/accounts.controller.ts,presenters/account-presenter.ts}`, `src/infra/app.module.ts`, `vitest.config.e2e.ts`, `test/e2e/accounts.e2e-spec.ts`, `test/support/merchants.ts`, `docs/task-runs/T8-*.md`, `docs/TASKS.md`.

## Tests Added or Updated

`test/e2e/accounts.e2e-spec.ts` (8): create with zero Balance, several Wallets, read Wallet, Balance after movements (750), identical 404 for foreign vs unknown (both routes), clearing Account never returned, API cannot create a clearing Account, 401 without a key. Written first and seen red.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (73), `pnpm test:integration` (57), `pnpm test:e2e` (14), `pnpm test:concurrency` (1).

## Validation Result

All green; invariant check clean after every e2e test.

## Decisions Made

- 404 for "not yours" and "does not exist" (settles the PRD open detail).
- Response shape: account `{ id, kind, currency }`, balance `{ accountId, balance, currency }` with `balance` in integer centavos.

## Follow-up Needed

T9 needs a Payment-facing 422 mapping (the shared Zod pipe still answers 400).

## Context for Next Task

Use the same `ApiKeyGuard` + `@CurrentMerchant()` pattern; `test/support/merchants.ts` provisions a Merchant and returns its `Authorization` header value.
