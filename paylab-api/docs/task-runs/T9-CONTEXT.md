# T9 Context

## Task

`POST /v1/payments` (required `Idempotency-Key`, two-transaction flow of ADR 0001, 422 error model) and `GET /v1/payments/:id` (`docs/tasks/T9.md`).

## Related PRD Acceptance Criteria

US-16..28 (creation and validation), US-29..36 (idempotency, crash resume), US-37..44 (settlement outcomes over HTTP).

## Relevant Prior Summaries

- T6: `SettlePaymentUseCase`; Settlement claims the row with a status-guarded UPDATE, so a repeat cannot double-settle.
- T7: `ApiKeyGuard` is opt-in per controller.
- T8: controller, presenter and module pattern; `test/support/merchants.ts`.

## Files Likely Affected

Application: create-payment, get-payment, fund-wallet-from-clearing use cases, `PaymentSubmitter`, `request-fingerprint`, two use-case errors, repository ports (`create` returns a boolean, `findClearingAccount`). Infra: payments controller, presenter, module, Idempotency-Key decorator, Zod pipe (422), error translation table. Tests: e2e (main and crash), fingerprint unit, updated pipe and translation specs.

## Test-First Plan

E2E through HTTP as in the task file, plus a fault-injected Settlement for the crash case.

## Constraints

Public API accepts only Wallet sources owned by the Merchant; the funding use case is not reachable from any controller; invalid requests create nothing; a failed Payment is final for its key.

## Risks

`PaymentsRepository.create` treats any P2002 as a taken key; a shared pipe status change (400 to 422) affects every future controller.

## Definition of Done

All e2e tests pass, global invariant check clean after each, typecheck and lint clean.
