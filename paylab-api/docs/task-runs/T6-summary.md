# T6 Summary

## Status

done

## What Changed

- `SettlePaymentUseCase` and `GetAccountBalanceUseCase` (application layer).
- `SettlementPort.settle` now returns `Either<InvalidPaymentTransitionError, Payment>` (T5 flagged the signature as adjustable). Insufficient funds is a `FAILED` Payment, not an error; the only error is settling a terminal Payment.
- `PrismaSettlement` (raw SQL, one READ COMMITTED interactive transaction): claim the Payment (`UPDATE ... WHERE status IN ('CREATED','PROCESSING')`, which also serializes double settlement), lock the source with `SELECT ... WHERE kind = 'WALLET' FOR NO KEY UPDATE` (a clearing source matches nothing, so no lock and no check), sum the Balance from `ledger_entries`, then either mark `FAILED`/`INSUFFICIENT_FUNDS` or insert the Ledger Transaction, both entries and mark `SUCCEEDED` with its reference. Comments explain the weak lock mode (ADR 0002).
- `PrismaAccountsRepository` (Balance is a live SQL aggregate) and `PrismaPaymentsRepository`, with account, payment and money mappers. The money mapper is the only `bigint` <-> `number` conversion; it rejects values outside the safe range.
- `LedgerModule` wires the ports and use cases; `AppModule` imports it (one import line and one array entry).

## Files Changed

src/domain/paylab/application/repositories/settlement-port.ts, src/domain/paylab/application/use-cases/{settle-payment,get-account-balance}.ts, src/infra/database/ledger.module.ts, src/infra/database/mappers/{money-mapper,account-mapper,payment-mapper}.ts, src/infra/database/repositories/{prisma-accounts-repository,prisma-payments-repository,prisma-settlement}.ts, src/infra/app.module.ts, test/integration/settlement.spec.ts, test/infra/database/mappers/money-mapper.spec.ts, docs/task-runs/T6-{CONTEXT,summary}.md.

## Tests Added or Updated

- `settlement.spec.ts` (15): success with entries and references, insufficient funds, exactly enough, clearing-sourced, withdrawal check, terminal SUCCEEDED and FAILED rejected unchanged, unknown Payment, resume from PROCESSING, Balance beyond the safe integer range (2^60), debit blocked by an external source-Wallet lock while a credit is not, clearing source takes no lock, Balance query (zero, credits minus debits, not found). Written first; the unit spec was seen red (module missing) before implementation. The global invariant helper runs after each test via the shared setup.
- `money-mapper.spec.ts` (4 unit tests).

## Commands Run

`pnpm typecheck`, `pnpm lint`, `pnpm test` (64), `pnpm test:integration` (50), `pnpm test:e2e` (1, boots AppModule with LedgerModule), `pnpm test:concurrency` (1).

## Validation Result

All green locally.

## Decisions Made

- Funds comparison is done in `bigint` inside the adapter, so a huge Balance cannot lose precision; only the Balance query converts to `number` (and throws beyond 2^53-1).
- The database row status, not the in-memory entity, decides whether a Payment may be settled.
- The source kind is read under the lock query itself rather than trusted from the caller.
- Transaction timeout 15s, maxWait 5s to tolerate lock waits.

## Follow-up Needed

- T9 must create Payments (`create`) and handle idempotency; `PaymentsRepository.save` is implemented but unused here.
- Lock waits have no `lock_timeout`; T10 may want to observe behavior under heavy contention.

## Context for Next Task

T8 can inject `GetAccountBalanceUseCase` and `AccountsRepository` from `LedgerModule` (Merchant scoping is not applied yet). T9 injects `SettlePaymentUseCase` after creating the Payment.
