# T5 Context

## Task

Pure domain layer, no database and no Nest container: Amount value object, Account kinds, Payment aggregate with state machine and creation rules, and repository/settlement ports (abstract classes). Spec: `docs/tasks/T5.md`.

## Related PRD Acceptance Criteria

US-15, US-20..24, US-42..44, US-46 (clearing-sourced Payments skip the funds check, expressed as `Payment.isBalanceConsumer()`).

## Relevant Prior Summaries

T1: bare Nest spine; `src/core` has `Either`, `Entity`, `AggregateRoot`, `ValueObject`, `UniqueEntityID`, `UseCaseError`.

## Files Likely Affected

`src/domain/paylab/enterprise/{entities,entities/value-objects,errors}`, `src/domain/paylab/application/repositories`, `test/domain/paylab/enterprise/entities`.

## Test-First Plan

Unit specs for Amount (integer centavos, rejects zero/negative/float/unsafe, add, compare), Account (Wallet needs Merchant, clearing has none, BRL only), Payment (creation rules, state machine, Balance Consumer).

## Constraints

Lane B boundary: no changes to package.json, vitest configs, prisma, CI, test infra. Existing unit vitest config already includes `test/**/*.spec.ts`.

## Risks

Amount numeric type must be safe integer; DB 64-bit conversion belongs to the infra mapper (T6).

## Definition of Done

Domain unit specs pass with no database; typecheck and lint green.
