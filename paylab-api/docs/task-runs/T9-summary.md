# T9 Summary

## Status

done

## What Changed

- `POST /v1/payments`: 201 for a new Payment, 200 when the key already existed; a funds failure is a normal response with a `FAILED` / `INSUFFICIENT_FUNDS` Payment. `GET /v1/payments/:id` returns own Payments only.
- `PaymentSubmitter` owns the two-transaction flow: insert `CREATED` (the unique (Merchant, key) constraint decides via `PaymentsRepository.create` returning `false` on conflict), then Settlement. A known key is replayed before any validation: same fingerprint returns or resumes, a different one is rejected.
- Resume safety (documented in the class): Settlement claims the row with a status-guarded UPDATE, so a repeated or concurrent settle waits on the row lock, then sees a terminal Payment and is rejected untouched; the submitter then returns the stored outcome. PROCESSING is never committed in September.
- `CreatePaymentUseCase`, `GetPaymentUseCase`, and the internal `FundWalletFromClearingUseCase` (provided and exported by `PaymentsModule`, used by tests and future seeds, no controller).
- 422 error model: the shared `ZodValidationPipe` now answers 422 with an English message; the error-translation table maps `InvalidAmountError`, `InvalidPaymentError`, `UnsupportedCurrencyError`, `DestinationAccountNotFoundError`, `IdempotencyKeyReusedError` to 422 with their own codes.
- Request fingerprint: SHA-256 over the normalized source, destination, amount and currency.

## Files Changed

`src/domain/paylab/application/{repositories/{payments,accounts}-repository.ts, services/{payment-submitter,request-fingerprint}.ts, use-cases/{create-payment,get-payment,fund-wallet-from-clearing}.ts, use-cases/errors/{destination-account-not-found,idempotency-key-reused}-error.ts}`, `src/infra/database/repositories/prisma-{accounts,payments}-repository.ts`, `src/infra/http/{payments.module.ts, controllers/payments.controller.ts, presenters/payment-presenter.ts, pipes/{zod-validation-pipe,idempotency-key.decorator}.ts, error-translation/*}`, `src/infra/app.module.ts`, tests below, `docs/task-runs/T9-*.md`, `docs/TASKS.md`.

## Tests Added or Updated

- `test/e2e/payments.e2e-spec.ts` (25 cases incl. 11 invalid-request variants and the missing key), `test/e2e/payments-crash.e2e-spec.ts` (Settlement fails once after transaction one; the Payment stays `CREATED`; the retry settles once), `test/domain/.../request-fingerprint.spec.ts` (7), pipe spec updated to 422, translation spec extended (5), `test/support/payments.ts` helpers.
- Written before the implementation, but not run red before it: the modules they import did not exist, so they could not have run. The suite went green on the first full run after typecheck passed.

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (85), `pnpm test:integration` (57), `pnpm test:e2e` (40), `pnpm test:concurrency` (1).

## Validation Result

All green; invariant check clean after every e2e test.

## Decisions Made

- A missing, foreign or clearing source is one 404 (same body as an unknown Account); an unknown destination is a 422 `DESTINATION_ACCOUNT_NOT_FOUND`. The task text lists "unknown Account" under 422 and "another Merchant's Wallet" as not-found; splitting by source and destination satisfies both and keeps the US-8 rule for sources.
- Body currency is required; anything but BRL is 422 (the only reachable currency mismatch, since all Accounts are BRL).
- Malformed ids in bodies and route params are 422; the shared pipe change is deliberate.

## Follow-up Needed

- `create` treats any unique violation as "key taken"; a different unique violation (e.g. the ledger reference) would be misread. None is reachable today.
- T10 should exercise the parallel case more heavily than the five-request check here.

## Context for Next Task

`test/support/payments.ts` has `fund`, `postPayment`, `createWallet` and `balanceOf` for e2e and concurrency specs. Settlement of a stranded `CREATED` Payment is resumed only by a request with the same key.
