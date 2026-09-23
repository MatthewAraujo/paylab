# PRD — PayLab September: Financial Core + PostgreSQL

Scope source: the "September — financial core + PostgreSQL" section of the PayLab project page in Notion. Vocabulary follows `CONTEXT.md`; decisions follow ADRs 0001–0004.

## Problem Statement

PayLab is a lab project whose purpose is to learn, by building and measuring, how a payment processor stays correct. There is no system yet that creates Payments and records money movements, so nothing can be explained about why an operation is safe or unsafe under concurrency, or why a query is fast or slow.

The builder needs a financial core that is provably consistent, and a dataset and toolset that expose real database problems: contention on a balance, slow history queries, wrong or missing indexes. The goal is not a fintech CRUD, it is a system that produces the failures worth studying.

Fictional Merchants also need an API to hold Wallets, move money between Accounts and read their history, without being able to create money or touch another Merchant's data.

## Solution

A modular-monolith backend on NestJS and PostgreSQL that:

- keeps a double-entry, append-only ledger whose invariants are enforced by the database itself;
- models Merchants, Wallets and a platform-owned External Clearing Account so that the sum of every Ledger Entry is always zero;
- accepts idempotent Payments and settles each one synchronously in a single atomic Settlement, checking sufficient funds under a lock on the source Wallet;
- serves Balance, history and a simple report through keyset-paginated, Merchant-scoped endpoints;
- ships a reproducible, skewed benchmark dataset and the tooling to run `EXPLAIN (ANALYZE, BUFFERS)` experiments on indexes and to compare concurrency strategies.

The month ends when the core is consistent and the builder can explain why an operation is safe or unsafe under concurrency and why a given query is fast or slow.

## User Stories

### Merchant onboarding and authentication

1. As a platform operator, I want to provision a Merchant with a script, so that no public sign-up endpoint exists in September.
2. As a platform operator, I want the provisioning script to print the Merchant's API key exactly once, so that the key is never recoverable afterwards.
3. As a platform operator, I want only a hash of the API key stored, so that a database leak does not expose usable credentials.
4. As a platform operator, I want the External Clearing Account for BRL created by migration or seed, so that the ledger is balanced from the first movement.
5. As a Merchant, I want to authenticate every request with my API key, so that only I can act on my Accounts.
6. As a Merchant, I want a request with a missing or invalid API key rejected, so that anonymous callers get nothing.
7. As a Merchant, I want every read and write scoped to my own Wallets, so that I can never see or move another Merchant's data.
8. As a Merchant, I want a request that references another Merchant's Wallet to look the same as one referencing a Wallet that does not exist, so that I cannot discover other Merchants' accounts.

### Wallets

9. As a Merchant, I want to create a Wallet, so that I have an Account to hold funds.
10. As a Merchant, I want to hold several Wallets, so that I can separate funds by purpose.
11. As a Merchant, I want to read a Wallet's details, so that I can confirm its identity and currency.
12. As a Merchant, I want to read a Wallet's Balance, so that I know how much I can spend.
13. As a Merchant, I want the Balance to be exactly the net of the Wallet's Ledger Entries, so that it can always be audited against the ledger.
14. As a Merchant, I want a new Wallet to start at a zero Balance, so that no money appears without a Ledger Transaction.
15. As a Merchant, I want the Wallet currency to be BRL in September, so that amounts have one unambiguous unit.

### Creating Payments

16. As a Merchant, I want to create a Payment from one of my Wallets to another Account, so that I can move money.
17. As a Merchant, I want to move money between two of my own Wallets, so that I can rebalance funds.
18. As a Merchant, I want to pay a Wallet owned by another Merchant, so that funds can flow between fictional companies.
19. As a Merchant, I want to withdraw funds from my Wallet to the External Clearing Account, so that money can leave the platform.
20. As a Merchant, I want Amounts expressed in centavos as integers, so that no rounding error can enter a financial value.
21. As a Merchant, I want a Payment with a zero or negative Amount rejected, so that no meaningless movement is recorded.
22. As a Merchant, I want a Payment with the same source and destination rejected, so that no self-transfer pollutes the ledger.
23. As a Merchant, I want a Payment referencing an unknown Account rejected, so that money never goes nowhere.
24. As a Merchant, I want a Payment across different currencies rejected, so that no implicit conversion happens.
25. As a Merchant, I want to be unable to create a Payment whose source is the External Clearing Account, so that I cannot mint money.
26. As a Merchant, I want to be unable to create a Payment whose source is another Merchant's Wallet, so that I cannot spend funds that are not mine.
27. As a Merchant, I want every invalid request to return a consistent, structured error, so that my client can handle it without guessing.
28. As a Merchant, I want an invalid request to leave no Payment behind, so that rejected requests have no side effects.

### Idempotency

29. As a Merchant, I want to be required to send an Idempotency Key when creating a Payment, so that retries are safe by construction.
30. As a Merchant, I want a request without an Idempotency Key rejected, so that no unsafe Payment can be created by accident.
31. As a Merchant, I want repeating a request with the same key and the same body to return the original Payment, so that a lost response never causes a double payment.
32. As a Merchant, I want repeating a key with a different body rejected, so that a key can never mean two different intents.
33. As a Merchant, I want two identical requests sent at the same time with the same key to produce exactly one Payment, so that concurrency cannot bypass idempotency.
34. As a Merchant, I want Idempotency Keys scoped to me, so that my keys never collide with another Merchant's.
35. As a Merchant, I want a retry after a crash between creation and settlement to resume the same Payment, so that no Payment is stranded and none is duplicated.
36. As a Merchant, I want to use a new key to try again after a failed Payment, so that a retry is a conscious new intent.

### Settlement and outcomes

37. As a Merchant, I want a Payment to settle within the same request, so that I receive the final outcome immediately.
38. As a Merchant, I want a successful Payment to end as `SUCCEEDED`, so that I know the money moved.
39. As a Merchant, I want a Payment that cannot be funded to end as `FAILED` with the reason `INSUFFICIENT_FUNDS`, so that I can distinguish a business failure from a bad request.
40. As a Merchant, I want a failed Payment returned as a normal successful HTTP response carrying the failed status, so that HTTP errors only ever mean "your request was wrong".
41. As a Merchant, I want a failed Payment to write nothing to the ledger, so that only consummated facts are recorded.
42. As a Merchant, I want a Payment to move through `CREATED`, `PROCESSING` and a terminal state, so that its lifecycle is explicit.
43. As a Merchant, I want a terminal Payment never to change state again, so that its outcome is trustworthy.
44. As a Merchant, I want impossible state transitions refused, so that a Payment cannot jump from `CREATED` straight to an inconsistent state.
45. As a Merchant, I want a settled Payment to have exactly one Ledger Transaction, and a failed one to have none, so that Payments and ledger reconcile one to one.
46. As a Merchant, I want a Payment funded from the External Clearing Account to skip the funds check, so that inbound funding is not blocked by a balance that clearing does not have.

### Concurrency and safety

47. As a Merchant, I want simultaneous Payments from the same Wallet to be serialized, so that they can never overspend a Balance.
48. As a Merchant, I want a Wallet's Balance to never go negative under any interleaving, so that overdraft is impossible.
49. As a Merchant, I want simultaneous Payments from different Wallets to run in parallel, so that unrelated activity does not wait.
50. As a Merchant, I want crossed transfers between two Wallets to never deadlock, so that opposite-direction payments always complete.
51. As a Merchant, I want incoming credits to a Wallet not to wait behind an outgoing debit, so that receiving money is never blocked by spending it.
52. As a builder, I want to run N concurrent Settlements against one Wallet and see exactly the number that fit succeed, so that I can prove the lock works.

### Ledger integrity

53. As an auditor, I want every Ledger Transaction to sum to zero, so that debits always equal credits.
54. As an auditor, I want the sum of all Ledger Entries in the system to be zero, so that money is neither created nor destroyed.
55. As an auditor, I want a Ledger Transaction to contain at least two Ledger Entries, so that an empty or one-sided transaction is impossible.
56. As an auditor, I want every Ledger Entry to reference an existing Ledger Transaction and Account, so that no entry is orphaned.
57. As an auditor, I want Ledger Entries and Ledger Transactions to be impossible to update or delete, so that history cannot be rewritten.
58. As an auditor, I want these rules enforced by the database rather than only by the application, so that a bug, script or migration cannot break them.
59. As an auditor, I want a Ledger Entry to carry a strictly positive Amount with debit or credit stated separately, so that direction is never encoded in a sign.
60. As an auditor, I want any future correction to be a new compensating Ledger Transaction, so that the original record always remains.
61. As a builder, I want an unbalanced insert attempted directly in SQL to fail at commit, so that I can demonstrate the safety net.

### History, Balance and reports

62. As a Merchant, I want to read a Wallet's Ledger Entry history, so that I can see how the Balance was reached.
63. As a Merchant, I want history returned newest first with a stable order, so that pages never repeat or skip entries.
64. As a Merchant, I want history paginated with an opaque cursor, so that deep pages are as fast as the first.
65. As a Merchant, I want to list my Payments, so that I can review my activity.
66. As a Merchant, I want to filter Payments by Account, status and period, so that I can find what I need.
67. As a Merchant, I want the Payment list paginated with the same cursor style, so that both listings behave the same way.
68. As a Merchant, I want to read a single Payment by its id, so that I can check the outcome of a specific request.
69. As a Merchant, I want a daily report of Payment volume and count by status, so that I can see my activity at a glance.
70. As a Merchant, I want reports to include only my own data, so that no aggregate leaks across Merchants.

### Performance and benchmarking

71. As a builder, I want a reproducible seed that generates about one million Payments and two million Ledger Entries inside PostgreSQL, so that experiments start from a known dataset.
72. As a builder, I want the seed to create a skewed distribution with a few hot Wallets holding most of the history, so that selectivity and contention problems appear.
73. As a builder, I want the benchmark to run in its own database, so that numbers are comparable between runs.
74. As a builder, I want statistics refreshed after loading, so that the planner reflects the real data.
75. As a builder, I want to capture `EXPLAIN (ANALYZE, BUFFERS)` for the Balance, history and report queries, so that I can explain why each is fast or slow.
76. As a builder, I want to compare simple, composite and partial indexes on the same queries, so that I can decide which indexes earn their cost.
77. As a builder, I want to compare keyset against offset pagination on a hot Wallet, so that the cost of depth is visible in a plan.
78. As a builder, I want to measure whether computing the Balance from the ledger becomes the bottleneck under lock, so that materialization is justified by evidence rather than assumed.
79. As a builder, I want to compare the baseline lock against serializable isolation with retry, optimistic versioning and advisory locks, so that I can explain the trade-offs of each.

### Operations and quality

80. As a developer, I want the project to run locally against PostgreSQL with a single command sequence, so that onboarding is quick.
81. As a developer, I want migrations to build the full schema, including triggers, from an empty database, so that environments are reproducible.
82. As a developer, I want an automated check that the whole ledger sums to zero and no Wallet is negative after any integration or concurrency test, so that invariants are asserted everywhere.
83. As a developer, I want structured error responses and request logging inherited from the reference architecture, so that behavior is observable from day one.
84. As a developer, I want the CI gate to run lint, typecheck and the fast test layers on every change, so that regressions are caught early.

## Implementation Decisions

**Product and scope**
- One deployable NestJS modular monolith with PostgreSQL. No Redis, queues, workers, Outbox, separate services or FakeBank in September.
- The React front end is out of this PRD and will be created separately later.
- The codebase is derived from the reference architecture in the sibling reference project: NestJS bootstrap and module system, layered use cases and entities, the Either result pattern, error translation, structured logging and the test tooling are kept. All Quintal Agro Pet bounded contexts, geocoding, storage and real-time gateway code are removed. Better Auth is removed for now and returns in February.

**Domain model (see `CONTEXT.md`)**
- Merchant owns Wallets. Account is either a Wallet or the platform-owned External Clearing Account. There is one External Clearing Account per currency, BRL only in September, provisioned outside the public API.
- Payment is the intent and lifecycle; Ledger Transaction and Ledger Entry are the facts. Settlement is the single atomic step that writes the Ledger Transaction and finishes the Payment.
- Balance is derived from the ledger and never stored.
- A Payment has a source Account and a destination Account with no type enum. Its nature (funding, withdrawal, transfer) is implied by the two Account kinds. A Payment whose source is a Wallet is a Balance Consumer.

**Payment lifecycle**
- States: `CREATED`, `PROCESSING`, `SUCCEEDED`, `FAILED`. `SUCCEEDED` and `FAILED` are terminal. Transitions are `CREATED → PROCESSING → SUCCEEDED | FAILED`; anything else is rejected by the domain.
- `FAILED` carries a failure reason; `INSUFFICIENT_FUNDS` is the only reason in September.
- Later states such as `CANCELLED`, `REFUNDED` and `REVERSED` are deliberately not modeled yet.

**Settlement (ADR 0001, ADR 0002)**
- `POST /payments` runs two transactions in one request. Transaction one persists the Payment as `CREATED` together with its Idempotency Key and commits. Transaction two moves it to `PROCESSING`, takes the lock, checks funds, writes the Ledger Transaction and Entries, and sets the terminal state.
- For a Balance Consumer, the source Wallet row is locked with a weak exclusive row lock (`FOR NO KEY UPDATE`) under `READ COMMITTED`; the Balance is then summed from the ledger inside the same transaction. Only the source is locked, so each Settlement holds one lock and crossed transfers cannot deadlock. The weak lock is chosen so that the foreign-key share lock taken by inserting a Ledger Entry never blocks credits.
- A Payment sourced from the External Clearing Account takes no lock and performs no funds check.
- If the process dies between the two transactions, the Payment stays `CREATED`; a retry with the same Idempotency Key finds it and resumes Settlement.
- When FakeBank makes `PROCESSING` a real asynchronous window, the model moves to reserve-on-`PROCESSING` with a hold Account. This is a planned supersession, not a September deliverable.

**Idempotency**
- `Idempotency-Key` is required on Payment creation and is unique per Merchant. The stored record includes a fingerprint of the request body. Same key and same body returns the original Payment; same key and a different body is rejected as invalid; concurrent identical requests yield exactly one Payment via a database uniqueness guarantee.
- A failed Payment is final for its key; retrying the intent needs a new key. Response caching and expiry are out of scope.

**Ledger integrity (ADR 0003)**
- The database enforces: each Ledger Transaction sums to zero and is non-empty (checked at commit), Ledger Entries reference an existing Ledger Transaction and Account, ledger rows cannot be updated or deleted, and Amounts are strictly positive with debit or credit in a separate column.
- These rules live in hand-written SQL migrations. The domain validates the same rules independently.

**Money**
- Amounts are integers in the smallest currency unit, stored in a 64-bit integer column, never floating point. A currency is carried on Accounts and Payments; only BRL is accepted in September and cross-currency Payments are rejected.

**Data access (ADR 0004)**
- Prisma owns the schema, migrations and ordinary reads and writes. Settlement, Balance computation, keyset queries and benchmarks use raw SQL inside an interactive transaction for explicit control of locks, isolation and plans.

**API contract**
- All routes are versioned under `/v1`. Authentication is by Merchant API key on every route.
- Accounts: create a Wallet, read an Account, read its Balance. History: list an Account's Ledger Entries. Payments: create (idempotent), read one, list with filters by Account, status and period. Reports: daily volume and count by status, per Merchant.
- Both list endpoints use keyset pagination ordered by creation time then id, returning an opaque cursor. Offset pagination exists only as a benchmark experiment, not as a public contract.
- Errors: an invalid request returns `422` with the standard error model and creates no Payment. A funds failure returns a successful HTTP response whose Payment has `FAILED` and `INSUFFICIENT_FUNDS`. Requests that reference another Merchant's Account behave as if the Account did not exist.
- The public API accepts only Payments whose source is a Wallet owned by the authenticated Merchant. Funding from the External Clearing Account is possible only through an internal path (script or seed) so that a Merchant can never mint money.

**Provisioning**
- Merchants and their API keys are created by a script. The key is shown once and only its hash is stored. The clearing Account is created by migration or seed. There is no Merchant management API.

**Benchmark dataset and experiments**
- A versioned SQL script generates about one million Payments and two million Ledger Entries across roughly a thousand Wallets and fifty Merchants using a seeded random source, with heavy skew so a small share of Wallets holds about half of the entries. It runs in a dedicated benchmark database, followed by a statistics refresh.
- Experiments to run and document: plans for Balance, history and report queries; simple versus composite versus partial indexes; keyset versus offset; whether the computed Balance under lock becomes the bottleneck; and the baseline lock versus serializable with retry, optimistic versioning and advisory locks.

## Testing Decisions

- A good test asserts external behavior only: HTTP responses, database state, and invariants. It does not assert which internal function was called or how a query is written.
- Seams, highest first:
  1. The HTTP API against a real PostgreSQL started by Testcontainers. This is the main seam and covers authorization, idempotency, outcomes, pagination and reports.
  2. Direct SQL against the real database, used only to prove the database-level integrity rules: unbalanced insert, empty transaction, `UPDATE`, `DELETE`, non-positive Amount and missing references must all fail.
  3. Domain unit tests for the Payment state machine and source/destination rules, with no database.
- Concurrency tests live in their own suite and use real parallel connections: N Settlements against one Wallet (only as many as fit succeed, the rest fail with insufficient funds, the Balance never goes negative), the same Idempotency Key fired in parallel (one Payment), crossed transfers (no deadlock), credits during an in-flight debit (not blocked), and a simulated crash between the two transactions followed by a retry (Settlement resumes exactly once).
- A reusable global-invariant check runs after integration and concurrency tests: the sum of all Ledger Entries is zero and no Wallet Balance is negative.
- Each database suite starts from a fresh PostgreSQL with all migrations applied, including triggers, so the integrity rules are always under test.
- Prior art: the reference project's layout of domain, integration, infra and end-to-end suites, its shared end-to-end setup and its Either-based use-case tests. Its shared reset-heavy test database is replaced by per-run containers.
- The default CI gate runs lint, typecheck and the fast layers; the concurrency and benchmark suites run separately.

## Out of Scope

- The React front end.
- FakeBank, provider integration, webhooks, reconciliation, and any asynchronous processing (queues, workers, Outbox, retries with backoff, DLQ).
- Redis or any cache.
- Reserve-on-processing and hold Accounts.
- Refunds, reversals, cancellations and the states that go with them.
- Multi-currency and currency conversion.
- Materialized balances, unless a measurement justifies one.
- Merchant self-service, Merchant management API, user accounts and login.
- Docker production image, Docker Compose deployment, NGINX and any cloud deployment.
- Metrics, tracing, dashboards, alerts, rate limiting and hardening beyond what is inherited.
- Kubernetes, event sourcing, CQRS, microservices and multi-region.

## Further Notes

- The project's success criterion is explanatory: for each layer, what problem existed, how it was measured, what alternatives were considered, why one was chosen, what guarantee it gives, and what cost it adds. Benchmark results and the reasoning behind each index or lock decision should be documented as they are produced, ideally as further ADRs.
- The Better Auth code and its environment variables are removed from the copied base now and are reintroduced in February together with authentication and authorization.
- Open detail to settle during planning: the exact status code for a request that references another Merchant's Account. The intent is that it is indistinguishable from a nonexistent Account.
- Accepting Testcontainers means Docker is required for the test suites, locally and in CI.
