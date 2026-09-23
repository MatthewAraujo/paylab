# T6 Context

## Task

Implement Settlement (ADR 0001, ADR 0002): in one READ COMMITTED transaction lock the source Wallet with `FOR NO KEY UPDATE`, compute its Balance from the ledger, then write the Ledger Transaction and both entries and mark the Payment `SUCCEEDED`, or mark it `FAILED` with `INSUFFICIENT_FUNDS`. Also expose the Balance query.

## Related PRD Acceptance Criteria

US-12, US-13 (Balance derived from the ledger), US-37..41, US-45..46 (Settlement outcomes, one Ledger Transaction per settled Payment), US-47..51 (concurrency-safe behavior; the parallel proof is T10).

## Relevant Prior Summaries

- T3: schema, BIGINT money, seeded clearing Account, `payments.ledger_transaction_id` unique.
- T4: deferred balance trigger and immutability triggers; `assertGlobalInvariants` runs after every DB test; fixtures in `test/support/fixtures.ts`.
- T5: domain entities and ports; `SettlementPort` signature may change; Prisma BigInt <-> number conversion belongs to one infra mapper.

## Files Likely Affected

- `src/domain/paylab/application/use-cases/{settle-payment,get-account-balance}.ts`, `.../repositories/settlement-port.ts`
- `src/infra/database/{mappers,repositories}/**`, `src/infra/database/ledger.module.ts`, `src/infra/app.module.ts` (one import)
- `test/integration/settlement.spec.ts`, `test/infra/database/mappers/money-mapper.spec.ts`

## Test-First Plan

Integration through the use case (no HTTP): funds enough; insufficient (FAILED, no Ledger Transaction, Balances unchanged); exactly enough; clearing-sourced (no check, no lock); Wallet to clearing obeys the check; terminal Payment rejected; Payment references its Ledger Transaction; Balance query; lock behavior (debit waits, credit does not, clearing takes no lock). Unit tests for the money mapper.

## Constraints

- Integers only; `bigint` stays inside the infra layer, converted at the mapper.
- Lock only the source Wallet, never the destination; clearing source takes no lock.
- Raw SQL for the critical path in one commented adapter (ADR 0004).
- Do not start T8/T9; crash-resume and concurrency proof belong to T9/T10.

## Risks

- Settlement accepts `CREATED` or `PROCESSING` so T9 can resume; a terminal Payment is rejected.
- A Balance beyond 2^53-1 makes the Balance query throw; Settlement itself compares in `bigint`.

## Definition of Done

All integration tests above pass, invariant helper clean after each, typecheck and lint green.
