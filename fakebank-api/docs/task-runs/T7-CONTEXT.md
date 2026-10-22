# T7 Context

## Task

Advance a deferred Provider Transaction through the lab surface: `POST /__test/transactions/:providerTransactionId/advance` with `{ status: SUCCEEDED | FAILED, failureCode? }`, Client-scoped, present only when `FAKEBANK_LAB_ENABLED=true`. The change goes through the T2 state machine and records the terminal event in the same database transaction. Spec: [T7](../tasks/T7.md).

## Related PRD Acceptance Criteria

- AC-24: `PROCESSING → SUCCEEDED`, or `FAILED` with a Failure Code → `200` with the new state, `completedAt` set; `FAILED` without a code → `400`.
- AC-25: already terminal → `409 INVALID_TRANSITION`, unchanged; another Client's or unknown id → `404`.
- AC-27 (deferred): only `transaction.processing` until advanced, then the terminal event.
- AC-29: lab off → `404` (already covered by `lab-disabled.e2e-spec.ts`).
- AC-4 (current status case): a replay after advancing returns the advanced state.

## Relevant Prior Summaries

- T2: `transitionProviderTransaction(current, transition, clock)` returns `Result`; errors `INVALID_TRANSITION { from, to }` (checked first) and `FAILURE_CODE_REQUIRED`. It accepts `{ to: 'PROCESSING' }` only to refuse it.
- T3: `ProviderTransactionRepository.findForClient`, `toProviderTransactionResponse`, `ClientAuthGuard` + `@CurrentClient()`, `DOMAIN_CLOCK`. Events are ordered by the identity column `sequence`. CHECKs: failure code iff `FAILED`, `completed_at` iff terminal.
- T4: replays read the live row.
- T6: `LabModule` (conditional on the flag, provides `ClientAuthGuard`); a `DEFERRED` scenario gives a `202 PROCESSING` row; tests run with the lab on; `bootWithEnv` for other envs.

## Files Likely Affected

- `src/infra/transactions/transactions.module.ts` (export the repository and `DOMAIN_CLOCK`).
- `src/infra/transactions/provider-transaction.repository.ts` (status-guarded update + event insert in one database transaction).
- `src/infra/lab/` (new): advance schema, service, controller, request documentation; `lab.module.ts`.
- Tests: `test/e2e/advance.e2e-spec.ts` (new), `test/concurrency/advance.spec.ts` (new), `test/e2e/docs.e2e-spec.ts`.

## Test-First Plan

All at the HTTP seam (e2e), events read from the event table:

1. AC-24: deferred → advance `SUCCEEDED` → `200`, `completedAt` set; GET agrees; events `processing`, `succeeded`.
2. AC-24: advance `FAILED` with `ACCOUNT_BLOCKED` → `200 FAILED` with the code; events `processing`, `failed`.
3. AC-24: `FAILED` without/blank `failureCode`, `status: PROCESSING`, unknown status, `failureCode` on `SUCCEEDED` → `400`, row and events unchanged.
4. AC-25: advancing a `SUCCEEDED` or `FAILED` transaction → `409 INVALID_TRANSITION`, row and events unchanged.
5. AC-25: unknown id and another Client's id → `404 TRANSACTION_NOT_FOUND`; AC-9 no key → `401`.
6. AC-4: replaying the original creation after advancing → `200`, `Idempotent-Replayed`, advanced status.
7. AC-25 concurrency: parallel advances on one `PROCESSING` transaction → exactly one `200`, the rest `409`; one terminal event.
8. AC-12: the route is documented in `/docs-json` with the lab on.

## Constraints

- The state machine decides; the SQL guard `WHERE status = 'PROCESSING'` (and client) protects the race. The update and its event go in one database transaction.
- Errors via `HttpException({ code, message })`; validation via `ZodValidationPipe`.
- Do not branch on `appliedOutcome`. Do not edit PROJECT.md, TASKS.md, PRD or task specs.

## Risks

- A check-then-update without the SQL guard lets two parallel advances both write terminal events (the concurrency test must catch it).
- A lost race must answer `409`, not `500` or `200`.

## Definition of Done

All tests above pass; the full gate (`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:integration && pnpm test:concurrency`) is green; T7-summary.md written; one commit.
