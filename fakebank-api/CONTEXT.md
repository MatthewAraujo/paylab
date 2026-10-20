# FakeBank

A fictional external payment provider (PSP/partner bank) used as an adversarial test environment for PayLab. It looks like a realistic payments API but operates only on simulated data and amounts. It owns its own state and database; PayLab sees it only over HTTP.

## Language

**Client**:
A system authorized to call FakeBank, identified by its API key. Idempotency, lookups by External Reference and Simulation Scenarios are all scoped to one Client. In October the only Client is PayLab.
_Avoid_: Merchant, tenant, customer

**Provider Transaction**:
One payment instruction received from a Client, with FakeBank's own identifier and its simulated, authoritative status. Its status is `PROCESSING`, `SUCCEEDED` or `FAILED`; the last two are terminal.
_Avoid_: Payment, charge, operation

**External Reference**:
The Client's own identifier for the payment behind a Provider Transaction (PayLab's Payment id), used to correlate and to recover when the Provider Transaction id was never received. It is not unique: two Provider Transactions may share one, and FakeBank never deduplicates by it.
_Avoid_: Order id, payment id (on the FakeBank side)

**Idempotency Key**:
A Client-chosen value that identifies one intended Provider Transaction. The same key with the same request never creates a second one; the same key with a different request is a conflict.
_Avoid_: Request id, dedup token

**Amount**:
A monetary value in the smallest unit of its currency (centavos for BRL), stored as an integer and never as a floating-point number. October operates in BRL only.
_Avoid_: Value, decimal money

**Failure Code**:
The business reason a Provider Transaction ended `FAILED`, such as `INSUFFICIENT_FUNDS`. It is a provider decision, not a transport or HTTP error.
_Avoid_: Error code, HTTP status

**Simulation Scenario**:
A Client-registered rule that tells FakeBank how to behave for the next attempts carrying a given External Reference: the Outcome, an optional delay, and how many attempts it affects before FakeBank returns to immediate success. Only available when the lab surface is enabled.
_Avoid_: Mock, fixture, test case

**Provider Transaction Event**:
An immutable record of one status a Provider Transaction entered, written in the same database transaction as the status change. It is the audit history today and the source of webhook notifications later.
_Avoid_: Log line, status history row, webhook

**Outcome**:
What a Simulation Scenario makes FakeBank do with an attempt: succeed, fail with a Failure Code, defer the decision (the Provider Transaction stays `PROCESSING` until advanced), be rate limited, or fail at the transport level before or after the Provider Transaction is persisted. A delay always happens after persistence, so a Client that gives up waiting may leave a Provider Transaction behind.
_Avoid_: Result, status

## October MVP: decisions and known risks

Scope, why, and what was rejected; the architecture decision is [ADR 0001](docs/adr/0001-fakebank-as-an-independent-http-service.md).

- **Two deliveries, this one first.** October is split into (a) the standalone FakeBank service and (b) PayLab consuming it. (b) is a separate PRD with its own grilling because it changes PayLab's core flow: a Payment must stay `PROCESSING` committed while waiting for the provider, which ADR 0001 of `paylab-api` and the `PaymentSubmitter` explicitly rule out today.
- **Scenarios are registered per External Reference, not sent per request.** The Client registers "External Reference X gets Outcome Y for N attempts" through the lab surface and then calls the public API normally, so a caller under test needs no lab headers and the public contract stays clean. Rejected: a scenario header per request (pollutes the contract, and PayLab would need test code to send it) and magic amounts (implicit, collide with real values).
- **Every delay happens after persistence.** Latency and "timeout after commit" are the same mechanism: FakeBank commits, waits, then answers, so a Client that gives up leaves a Provider Transaction behind, as with a real client or load-balancer timeout. A dedicated "drop the socket" Outcome was rejected as unrealistic; `ERROR_AFTER_COMMIT` (a `500` with the transaction persisted) covers the explicit case.
- **`PROCESSING → SUCCEEDED | FAILED` only.** Invalid payloads are `400/422` and persist nothing, so `REJECTED` is not a status; nothing observable ever rests in `RECEIVED`, so it is not one either. Both return when something real needs them.
- **An idempotent replay returns the current state** (`200`, `Idempotent-Replayed: true`), never a stored copy of the first response: the first attempt may never have produced one. Scenario attempts are not consumed by a replay of a persisted transaction; pre-commit Outcomes (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`) still apply.
- **No deduplication by External Reference.** A Client resending the same payment with a new Idempotency Key gets a second Provider Transaction; the lookup by External Reference returns a list. Protecting PayLab from its own double submission would hide the bug the lab exists to expose.
- **Rate limiting is only simulated** (`RATE_LIMIT` Outcome). A real limiter belongs to the December load work.
- **Lab surface:** `POST /__test/scenarios` and `POST /__test/transactions/{id}/advance`, authenticated and scoped like the public API, present only with `FAKEBANK_LAB_ENABLED=true` (404 otherwise; the app refuses to boot with it in production). No reset or webhook replay endpoint.
- **Clients are static configuration** (API key hashes in the environment), not a table; there is one Client in October.
- **Risk: the lab flag is the only thing standing between a deployment and a scenario-injection API.** November's ECS deployment must keep it off and should test that boot refuses it in production.
