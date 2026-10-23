# PRD — FakeBank October MVP (standalone Provider Simulator)

Domain language: [CONTEXT.md](../CONTEXT.md). Architecture: [ADR 0001](adr/0001-fakebank-as-an-independent-http-service.md). Source specification: the Notion page "FakeBank — Especificação do Provider Simulator", sections 1–8, 11 and 13.

## Problem Statement

PayLab settles every Payment synchronously inside its own database and has never talked to an external provider. Every hard problem of real payment processing — a request that timed out after the provider already processed it, a retry that might charge twice, a provider that is slow, rate limited or failing — is therefore invisible: there is nothing to fail. The developer cannot practise or demonstrate how PayLab should behave against a hostile external dependency, and cannot reproduce a distributed failure on demand.

## Solution

A second, independent service, FakeBank, that behaves like a realistic payment provider API but operates only on simulated data. A Client sends payment instructions over HTTP with an Idempotency Key; FakeBank persists a Provider Transaction under its own identifier, decides its status, and lets the Client look it up by id or by External Reference. A lab surface, available only when explicitly enabled, lets a test register a Simulation Scenario for an External Reference so that the next attempts succeed, fail for a business reason, stay pending, are rate limited, fail before persisting, fail after persisting, or answer slowly. Failures are deterministic and reproducible. FakeBank runs on its own with Docker Compose and also starts as part of the workspace development stack.

This PRD covers the standalone service only. PayLab consuming FakeBank is a separate, later PRD (see Out of Scope).

## User Stories

1. As a Client, I want to submit a payment instruction with an External Reference, an Amount in centavos and a currency, so that FakeBank records it as a Provider Transaction.
2. As a Client, I want every Provider Transaction to receive a FakeBank identifier, so that I can refer to it unambiguously later.
3. As a Client, I want to be required to send an Idempotency Key, so that a retry of the same instruction can never create a second Provider Transaction.
4. As a Client, I want a retry with the same Idempotency Key and the same request to return the existing Provider Transaction in its current status, so that I can recover the outcome after a timeout.
5. As a Client, I want a retry with the same Idempotency Key but a different request to be rejected as a conflict, so that a programming error is never silently accepted.
6. As a Client, I want concurrent identical requests with the same Idempotency Key to result in exactly one Provider Transaction, so that racing retries are safe.
7. As a Client, I want my Idempotency Keys scoped to me, so that another Client using the same key never collides with mine.
8. As a Client, I want to read a Provider Transaction by its identifier, so that I can poll its authoritative status.
9. As a Client, I want to list the Provider Transactions that carry a given External Reference, so that I can recover when I never received the FakeBank identifier.
10. As a Client, I want that lookup to return every matching Provider Transaction, so that my own accidental double submission is visible instead of hidden.
11. As a Client, I want to see only my own Provider Transactions, so that other Clients' data never leaks to me.
12. As a Client, I want a decided outcome to be answered with `201` and a pending one with `202`, so that I never confuse "accepted for processing" with "processed".
13. As a Client, I want a business failure to be reported as a `FAILED` Provider Transaction with a Failure Code, so that I can tell a permanent business decision apart from a transient error.
14. As a Client, I want invalid payloads rejected without anything being persisted, so that a malformed request leaves no trace to reconcile.
15. As a Client, I want every error to have the same shape with a code, a message, a retryable flag and a request id, so that I can decide programmatically whether to retry.
16. As a Client, I want my request id echoed back, so that I can correlate my logs with FakeBank's.
17. As a Client, I want amounts as integer centavos only, so that no floating-point rounding is ever involved.
18. As a Client, I want requests without a valid API key rejected, so that only authorized systems can create Provider Transactions.
19. As a developer testing PayLab, I want to register a Simulation Scenario for an External Reference, so that the next attempts behave as I need without changing the caller's requests.
20. As a developer, I want a scenario that makes the attempt fail with a Failure Code, so that I can exercise business failures.
21. As a developer, I want a scenario that leaves the Provider Transaction `PROCESSING` with a `202`, so that I can exercise polling and eventual completion.
22. As a developer, I want to advance a `PROCESSING` Provider Transaction to `SUCCEEDED` or `FAILED`, so that I control exactly when a deferred decision happens.
23. As a developer, I want a scenario that answers `429` with `Retry-After` and persists nothing, so that I can exercise backoff.
24. As a developer, I want a scenario that answers `503` without persisting anything, so that I can exercise a safe retry.
25. As a developer, I want a scenario that persists the Provider Transaction and then answers `500`, so that I can exercise an ambiguous outcome where the provider did the work.
26. As a developer, I want a scenario delay that happens after persistence, so that a client timeout leaves a Provider Transaction behind exactly as a real slow provider or load balancer would.
27. As a developer, I want to choose how many attempts a scenario affects, so that "fail once, then succeed on retry" is expressible.
28. As a developer, I want FakeBank to return to immediate success once a scenario is exhausted or when none is registered, so that the default path needs no setup.
29. As a developer, I want registering a scenario again for the same External Reference to replace the previous one, so that tests stay independent.
30. As a developer, I want concurrent retries to consume a scenario attempt at most once each, so that `times` is exact under parallelism.
31. As a developer, I want a retry of an already persisted Provider Transaction not to consume post-persistence scenario attempts, so that recovery after an ambiguous failure returns the stored outcome.
32. As a developer, I want every status a Provider Transaction enters recorded as an immutable Provider Transaction Event in the same database transaction, so that tests can audit the history and January's webhooks have a source.
33. As a developer, I want the event history protected against updates and deletes by the database, so that a bug or script cannot rewrite it.
34. As a developer, I want invalid status transitions refused, so that a terminal Provider Transaction can never change.
35. As an operator, I want the lab surface to exist only when explicitly enabled, so that a deployment cannot accidentally expose scenario injection.
36. As an operator, I want FakeBank to refuse to start with the lab surface enabled in production, so that the misconfiguration fails loudly.
37. As an operator, I want the lab endpoints to answer `404` when disabled, so that they are indistinguishable from nonexistent routes.
38. As a developer, I want FakeBank to start on its own with one Docker Compose command, so that I can work on it without PayLab.
39. As a developer, I want FakeBank and its database to start with the workspace development stack, so that both services are available together for the integration phase.
40. As a developer, I want OpenAPI documentation of the public and lab contracts, so that I can explore and call the API without reading code.
41. As an operator, I want a health endpoint, so that Compose and future deployments can check liveness.
42. As a developer, I want Client API keys configured as hashes in the environment, so that no plaintext secret is required in configuration beyond local development defaults.

## Acceptance Criteria

Public API

- **AC-1**: Given a valid API key, when a Client posts a transaction with an Idempotency Key, an External Reference, a positive integer `amountMinor` and `currency` `BRL` and no scenario is registered, then the response is `201` with a `providerTransactionId` prefixed `FBK-`, the echoed External Reference, Amount and currency, status `SUCCEEDED`, `failureCode` null and `completedAt` set. (US 1, 2, 12, 17, 28)
- **AC-2**: A request without the `Idempotency-Key` header is answered `400` and nothing is persisted. (US 3, 14)
- **AC-3**: A body that violates the schema (missing fields, non-integer or non-positive `amountMinor`, empty or oversized External Reference or key) is answered `400` with code `VALIDATION_ERROR`; a well-formed body with a currency other than `BRL` is answered `422` with code `UNSUPPORTED_CURRENCY`; in both cases nothing is persisted. (US 14, 17)
- **AC-4**: Repeating the same request with the same Idempotency Key returns `200`, the header `Idempotent-Replayed: true`, the same `providerTransactionId` and the Provider Transaction's current status, and no second Provider Transaction exists. (US 4)
- **AC-5**: The same Idempotency Key with a different body (any of External Reference, Amount, currency) is answered `409` with code `IDEMPOTENCY_KEY_REUSED`, and the original Provider Transaction is unchanged. (US 5)
- **AC-6**: Two Clients using the same Idempotency Key each get their own Provider Transaction. (US 7)
- **AC-7**: Reading a Provider Transaction by id returns `200` with its current state; an unknown id, or an id belonging to another Client, returns `404` with code `TRANSACTION_NOT_FOUND`. (US 8, 11)
- **AC-8**: Listing by External Reference returns `200` with every Provider Transaction of the calling Client carrying it, oldest first, including two created with different Idempotency Keys; an External Reference with no match returns `200` with an empty list; another Client's transactions are never included. (US 9, 10, 11)
- **AC-9**: A missing or unknown API key is answered `401` with code `UNAUTHORIZED` on every public and lab endpoint. (US 18)
- **AC-10**: Every error response has the shape `{ code, message, retryable, requestId }`; `retryable` is true exactly for `429`, `500` and `503`. When the request carries `X-Request-Id` that value is used as `requestId` and echoed in the response header; otherwise one is generated and echoed. (US 15, 16)
- **AC-11**: `GET /health` returns `200` without authentication. (US 41)
- **AC-12**: OpenAPI documentation is served at `/docs` and describes the public endpoints, their status codes and the error shape; the lab endpoints are documented only when the lab surface is enabled. (US 40)

Simulation Scenarios

- **AC-13**: With the lab enabled, a Client can register a scenario for an External Reference with an Outcome, optional `delayMs`, `failureCode` (required for `FAIL`, rejected otherwise), `retryAfterSeconds` (only for `RATE_LIMIT`) and `times` (default 1); invalid combinations are answered `400`. Registering again for the same External Reference replaces the previous scenario. (US 19, 27, 29)
- **AC-14**: `FAIL`: the attempt persists a Provider Transaction `FAILED` with the registered Failure Code and answers `201`. (US 13, 20)
- **AC-15**: `DEFERRED`: the attempt persists a Provider Transaction `PROCESSING` and answers `202` with `completedAt` null; a later read still shows `PROCESSING`. (US 12, 21)
- **AC-16**: `RATE_LIMIT`: the attempt is answered `429` with code `PROVIDER_RATE_LIMIT` and a `Retry-After` header (default 1, or `retryAfterSeconds`), and nothing is persisted. (US 23)
- **AC-17**: `ERROR_BEFORE_COMMIT`: the attempt is answered `503` with code `PROVIDER_UNAVAILABLE`, and nothing is persisted. (US 24)
- **AC-18**: `ERROR_AFTER_COMMIT`: the attempt persists a Provider Transaction `SUCCEEDED` and answers `500` with code `PROVIDER_INTERNAL_ERROR`; a retry with the same Idempotency Key returns `200` with that same Provider Transaction. (US 25, 31)
- **AC-19**: With `delayMs`, FakeBank persists the Provider Transaction first and answers only after the delay. A Client whose own timeout is shorter than the delay gets a timeout; afterwards, reading by External Reference or retrying with the same key shows exactly one Provider Transaction with the scenario's status. (US 26, 31)
- **AC-20**: A scenario with `times: N` affects exactly the next N attempts for that External Reference; attempt N+1 behaves as immediate success. Example: `RATE_LIMIT` with `times: 1` answers `429` once and the retry answers `201`. (US 27, 28)
- **AC-21**: Pre-persistence Outcomes (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`) apply and consume attempts even when the Idempotency Key already has a persisted Provider Transaction; a retry of a persisted Provider Transaction does not consume attempts of any other Outcome and is not delayed. (US 31)
- **AC-22**: N parallel attempts against a scenario with `times: K` (K < N) produce exactly K scenario-shaped responses. (US 30)
- **AC-23**: Scenarios are scoped to the Client: a scenario registered by one Client never affects another Client's attempts with the same External Reference. (US 11, 19)

Lab surface and state machine

- **AC-24**: Advancing a `PROCESSING` Provider Transaction to `SUCCEEDED`, or to `FAILED` with a Failure Code, answers `200` with the new state and sets `completedAt`; `FAILED` without a Failure Code is answered `400`. (US 22)
- **AC-25**: Advancing a Provider Transaction that is already `SUCCEEDED` or `FAILED` is answered `409` with code `INVALID_TRANSITION` and leaves it unchanged; advancing another Client's or an unknown id is answered `404`. (US 22, 34)
- **AC-26**: The state machine allows only `PROCESSING → SUCCEEDED` and `PROCESSING → FAILED`; every other transition is refused. (US 34)
- **AC-27**: Every Provider Transaction has one Provider Transaction Event per status it entered, in order, written in the same database transaction as the change: an immediate success has `transaction.processing` then `transaction.succeeded`; a deferred one has only `transaction.processing` until advanced. Requests that persist nothing write no event. (US 32)
- **AC-28**: The database rejects `UPDATE` and `DELETE` on Provider Transaction Events. (US 33)
- **AC-29**: With `FAKEBANK_LAB_ENABLED` unset or false, every lab endpoint answers `404`. (US 35, 37)
- **AC-30**: The application refuses to start when `FAKEBANK_LAB_ENABLED` is true and `NODE_ENV` is `production`. (US 36)

Concurrency and operations

- **AC-31**: N parallel identical requests with the same Idempotency Key create exactly one Provider Transaction and one pair of events; every response carries the same `providerTransactionId`. (US 6)
- **AC-32**: From `fakebank-api`, one Docker Compose command starts FakeBank and its own PostgreSQL, applies migrations, and `GET /health` and `/docs` answer on port 4000. (US 38)
- **AC-33**: The workspace development stack starts FakeBank and a dedicated FakeBank PostgreSQL alongside PayLab, with FakeBank bound to `127.0.0.1:4000`, its database not published on the host, its own volume, and source edits reloading the service; the existing PayLab services and their behavior are unchanged. (US 39)
- **AC-34**: Client API keys are configured as SHA-256 hashes in the environment and compared in constant time; local development defaults are documented and confined to development configuration. (US 42)

## Implementation Decisions

- **New service.** A standalone NestJS 11 HTTP application in its own workspace folder, with its own `package.json`, Prisma schema and hand-written SQL migrations, `PROJECT.md`, `CONTEXT.md` and ADRs (ADR 0001). Same toolchain as `paylab-api`: Node 22, pnpm, TypeScript, Zod validation, Biome, Vitest with SWC, Supertest, Testcontainers. No code is shared with `paylab-api`; small infrastructure duplication is accepted.
- **Internal shape.** Lean Nest modules: transactions (public API), scenarios (registration and attempt decision), lab (lab controllers, conditional on the flag), plus auth, environment, database and HTTP error translation. The Provider Transaction state machine is a pure module with no Nest or Prisma dependency; it owns allowed transitions and produces the events of a transition.
- **Schema.**
  - `provider_transaction`: id (`FBK-` + UUID v7), client id, External Reference, Idempotency Key, request fingerprint, Amount (bigint centavos, positive), currency, status, Failure Code, created/updated/completed timestamps, applied scenario Outcome (diagnostic only). Unique on (client id, Idempotency Key); indexed on (client id, External Reference, created at). No uniqueness on External Reference.
  - `provider_transaction_event`: event id, Provider Transaction id, type (`transaction.processing`, `transaction.succeeded`, `transaction.failed`), status, Failure Code, occurred at. Triggers reject `UPDATE` and `DELETE`.
  - `simulation_scenario`: client id, External Reference (unique together), Outcome, delay, Failure Code, retry-after seconds, remaining attempts.
- **Status model.** `PROCESSING → SUCCEEDED | FAILED`, both terminal. Every Provider Transaction is created `PROCESSING`; for immediate Outcomes the terminal transition happens in the same database transaction, writing both events. No `RECEIVED` or `REJECTED` status.
- **Attempt pipeline for creation:** authenticate → validate → consume a pre-persistence scenario attempt if one applies (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`) → idempotency: insert, or on key conflict load the existing row and compare fingerprints (`409` on mismatch, `200` replay on match, with no further scenario consumption and no delay) → for a new row, consume a scenario attempt and apply its Outcome inside the same database transaction → commit → wait `delayMs` → respond (`201`, `202`, or `500` for `ERROR_AFTER_COMMIT`). Delay for pre-persistence Outcomes happens before their error response, with nothing persisted.
- **Atomicity.** The unique (client, Idempotency Key) constraint is the only arbiter of concurrent duplicates, as in PayLab. Scenario attempts are consumed with a single conditional decrement (`remaining > 0`) so parallel attempts never share one.
- **Request fingerprint** is computed from the normalized External Reference, Amount and currency.
- **API contract.**
  - `POST /v1/transactions` — headers `Authorization: Bearer <key>`, `Idempotency-Key` (1–255 chars), optional `X-Request-Id`; body `{ externalReference (1–128 chars), amountMinor (positive safe integer), currency }`.
  - `GET /v1/transactions/:providerTransactionId`; `GET /v1/transactions?externalReference=` (returns `{ data: [...] }`).
  - Transaction representation: `providerTransactionId, externalReference, status, amountMinor, currency, failureCode, createdAt, updatedAt, completedAt`.
  - `POST /__test/scenarios` — `{ externalReference, outcome, delayMs? (0–120000), failureCode?, retryAfterSeconds? (1–3600), times? (1–100) }` → `201`.
  - `POST /__test/transactions/:providerTransactionId/advance` — `{ status: SUCCEEDED | FAILED, failureCode? }`.
  - `GET /health`.
  - Error codes: `VALIDATION_ERROR`, `UNSUPPORTED_CURRENCY`, `UNAUTHORIZED`, `TRANSACTION_NOT_FOUND`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_TRANSITION`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_INTERNAL_ERROR`.
- **Configuration**, validated at boot: `DATABASE_URL`, `PORT` (default 4000), `NODE_ENV`, `FAKEBANK_CLIENTS` (comma-separated `clientId:sha256-hex-of-key`), `FAKEBANK_LAB_ENABLED` (default false; boot fails if true in production), logging variables mirroring `paylab-api`. A small script prints the hash of a given key.
- **Docker.** A development image and a `docker-compose.yml` inside the service (API plus its own PostgreSQL, migrations applied on start, lab enabled, a documented development Client key). The workspace `compose.yaml` gains `fakebank` and `fakebank-postgres` services with their own volume, FakeBank on `127.0.0.1:4000`, source mounted for reload, lab enabled; PayLab services are not changed and do not call FakeBank yet.
- **Documentation.** Service `PROJECT.md` (stack, commands, environment, local setup), workspace `PROJECT.md` updated with the new service, port and spec links.

## Testing Decisions

- Good tests exercise external behavior through the highest seam: HTTP requests in, status codes, bodies and persisted rows out. They never assert on internal calls or module structure.
- **E2E (main seam):** the real application module against a Testcontainers PostgreSQL, driven with Supertest, mirroring `paylab-api`'s `buildTestApp` and e2e layout. Covers AC-1 to AC-21, AC-23 to AC-25, AC-27, AC-29, AC-34. Event assertions read the event table directly since no endpoint exposes it. The timeout case (AC-19) uses a Supertest client timeout shorter than `delayMs`, then verifies through the API.
- **Concurrency suite**, run separately like `paylab-api`'s: AC-22 and AC-31, with parallel HTTP requests against a real server; prior art `test/concurrency/idempotency.spec.ts` in `paylab-api`.
- **Unit:** the pure state machine (AC-26): every allowed and refused transition and the events it produces. Boot refusal with the lab on in production (AC-30) is tested on the environment schema, because Nest's configuration validation fails during module import, which Vitest cannot catch cleanly; it is also checked manually against the built app (revised after T6).
- **Integration (database):** the event immutability triggers (AC-28), via direct SQL, like `paylab-api`'s schema and trigger tests.
- **Manual, documented:** the standalone and workspace Compose stacks (AC-32, AC-33), checked with the documented commands, as in the existing Docker specifications.

## Out of Scope

- PayLab consuming FakeBank (HTTP client, a committed `PROCESSING` Payment, timeout recovery, showing provider results in the Operational Console). It is the next PRD and needs its own grilling, because it supersedes part of `paylab-api` ADR 0001.
- Webhooks: endpoint registration, signing, dispatch, retries, duplicates, reordering, replay, and an endpoint exposing events.
- Reconciliation files and S3.
- A real rate limiter, load testing, metrics dashboards, tracing.
- `/__test/reset`, `/ready`, Client provisioning in a database, key rotation.
- Scenarios on read endpoints; random or seed-based failure modes.
- Automatic completion of deferred Provider Transactions over time.
- Refunds, reversals, currencies other than BRL.
- Deployment to AWS (November) and a FakeBank user interface.

## Further Notes

- `ERROR_AFTER_COMMIT` persists the Provider Transaction as `SUCCEEDED`: the provider did the work and only the response failed, which is the case reconciliation must learn to handle. Combining it with a business failure is not supported in October.
- The lab flag is the only barrier against scenario injection; the November deployment must keep it off (recorded as a risk in `CONTEXT.md`).
- The workspace stack's PayLab services ignore FakeBank until the integration PRD lands.
