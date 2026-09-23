# ADR 0001: Generate the API client from PayLab OpenAPI

## Status

Accepted

## Context

The PayLab backend is evolving task by task. Only `GET /health` is currently exposed, while Accounts, Payments, Ledger history, and reports are planned in backend tasks T8, T9, and T11. Maintaining handwritten request and response types in the UI would create a second contract that could drift from NestJS controllers and Swagger metadata.

The UI must use only real backend capabilities. Runtime mock data and silent fallbacks are not allowed.

## Decision

Generate the PayLab UI TypeScript client from the backend OpenAPI document. Treat the generated output as replaceable build output and keep application-facing adapters small.

Capability Availability is determined from what the generated contract exposes. A missing endpoint produces an honest unavailable state in the corresponding UI surface rather than mock financial data.

The API base URL is environment configuration. The UI may call the current health endpoint directly until it is represented by the generated client, but it must not maintain parallel handwritten financial DTOs.

## Consequences

- Backend Swagger metadata becomes part of the integration contract and must be complete for new endpoints.
- Contract drift becomes a generation or type-check failure instead of a runtime surprise.
- The frontend cannot become operational for a capability before its HTTP contract exists.
- Local development needs a running API or a checked-in OpenAPI snapshot produced from the backend; the snapshot contains schema only, never example financial records used as runtime data.
- Test-controlled HTTP responses remain allowed in automated tests, but the running application has no mock transport or fallback.
