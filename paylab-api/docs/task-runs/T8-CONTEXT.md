# T8 Context

## Task

Merchant-scoped Wallet endpoints under `/v1`: create Wallet, read Account, read Balance (`docs/tasks/T8.md`).

## Related PRD Acceptance Criteria

US-7, US-8, US-9..15.

## Relevant Prior Summaries

- T6: `GetAccountBalanceUseCase`, `AccountsRepository` (Balance is a live ledger aggregate), `LedgerModule`.
- T7: `ApiKeyGuard` (opt-in per controller), `@CurrentMerchant()`, `AuthModule`.

## Files Likely Affected

Application: create-wallet, get-account use cases; optional Merchant scoping on get-account-balance. Infra: accounts controller, account presenter, accounts module, `app.module.ts` (one import + one array entry), `vitest.config.e2e.ts` (DB reset and invariant setup for e2e). Tests: `test/e2e/accounts.e2e-spec.ts`, `test/support/merchants.ts`.

## Test-First Plan

E2E spec as listed in the task file, written before the controller and seen red.

## Constraints

Integer centavos with explicit currency; same 404 for unknown, foreign and clearing Accounts; the API never creates a clearing Account; guard applied on the controller.

## Risks

Route added without the guard would be public; e2e now shares the database reset and invariant hooks with integration.

## Definition of Done

All e2e tests pass, global invariant check clean after each, typecheck and lint clean.
