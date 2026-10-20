# FakeBank is an independent HTTP service with its own database

Status: accepted

FakeBank is a separate NestJS HTTP application (`fakebank-api/`) with its own PostgreSQL database, next to `paylab-api` and `paylab-ui` in the workspace. PayLab and FakeBank see each other only over HTTP (and, later, webhooks and reconciliation files); neither reads the other's tables nor imports the other's code.

The purpose of FakeBank is to reproduce the failures of a real external provider: HTTP status semantics (`201` versus `202`, `409`, `429` with `Retry-After`, `500`/`503`), client timeouts and ambiguous outcomes. Those only exist on a real network boundary with a real REST contract, so the boundary itself is the thing under test.

## Considered Options

- **`@nestjs/microservices`** (message patterns over TCP, Redis, NATS, Kafka or RabbitMQ). Rejected: it replaces HTTP with a message transport, so the contract would not resemble any real payment provider and none of the HTTP failure modes could be exercised. It also has no native SQS transport for the January worker phase.
- **Nest monorepo mode** (`apps/paylab-api`, `apps/fakebank`, shared `libs/`). Rejected: it forces a restructure of `paylab-api`, and shared libraries invite importing one side's domain code into the other, the coupling this service exists to forbid.
- **A module inside `paylab-api`.** Rejected for the same reason; one process and one database make the boundary trivial to cross by accident.

## Consequences

The two services duplicate some infrastructure code (environment validation, error envelope, test setup). That duplication is accepted; it is not extracted into a shared package.
