# PRD — PayLab Operational Console MVP

## Problem Statement

PayLab's backend is designed to make financial correctness, payment lifecycle behavior, ledger integrity, and later distributed-system behavior observable. Without a focused frontend, a developer or interviewer must infer that behavior from API calls, database rows, and explanations.

The backend is also evolving incrementally. Its PostgreSQL schema, ledger invariants, and core domain types exist today, but only `GET /health` is publicly available. Accounts, Payments, history, and reporting endpoints are planned in backend tasks T8, T9, and T11. A frontend that invents data or silently falls back to mocks would hide this boundary and risk drifting from the real API.

## Solution

Create `paylab-ui`, an English-language internal Operational Console in Next.js and TypeScript. It will be a focused window into PayLab rather than a second large product.

The MVP provides a production-oriented application shell and the primary navigation for Dashboard, Accounts, Payments, Ledger, and System Health. It communicates only with the real `paylab-api`. Its TypeScript client is generated from the backend OpenAPI document so available capabilities and data contracts follow the API.

System Health is functional immediately through `GET /health`. Financial areas render clear loading, empty, error, and capability-unavailable states until their corresponding API operations exist. As T8, T9, and T11 land, regeneration of the client unlocks the relevant features without introducing a runtime mock mode.

## User Stories

1. As a PayLab operator, I want a consistent application shell, so that I can navigate the platform's operational areas quickly.
2. As a PayLab operator, I want the interface in English, so that the project is suitable for an international portfolio and uses the backend's canonical vocabulary.
3. As a PayLab operator, I want the current section and page title to be obvious, so that I always know which operational context I am viewing.
4. As a PayLab operator, I want the layout to work on desktop and smaller screens, so that the console remains usable without maintaining separate applications.
5. As a PayLab operator, I want financial Amounts formatted as BRL while preserving integer centavos in the data boundary, so that presentation never introduces floating-point money behavior.
6. As a PayLab operator, I want dates and times presented consistently, so that events and records can be compared without ambiguity.
7. As a PayLab operator, I want loading states for every remote operation, so that network activity is visible.
8. As a PayLab operator, I want useful empty states, so that the absence of records is not mistaken for a broken page.
9. As a PayLab operator, I want actionable error states with retry, so that temporary API failures do not require a page reload.
10. As a PayLab operator, I want unavailable backend capabilities identified explicitly, so that planned features are never presented as live.
11. As a developer, I want the UI to use an environment-configured API base URL, so that local and deployed environments can target the correct backend.
12. As a developer, I want a generated TypeScript API client, so that the frontend contract follows the backend OpenAPI document.
13. As a developer, I want contract generation to be repeatable, so that backend API changes can be incorporated with one documented command.
14. As a developer, I want generated code isolated from handwritten UI code, so that regeneration never overwrites product logic.
15. As a developer, I want missing API operations to be a visible integration condition, so that the UI does not silently use stale or invented contracts.
16. As a PayLab operator, I want to see API health, application name, and environment, so that I can verify which backend instance the console reached.
17. As a PayLab operator, I want health checks to refresh on demand, so that I can verify recovery after an outage or restart.
18. As a PayLab operator, I want a clear disconnected state when the API cannot be reached, so that transport failures are distinguishable from financial empty states.
19. As a PayLab operator, I want the Dashboard area ready to show daily Payment count, volume, and status breakdown when the report endpoint exists, so that activity can be understood at a glance.
20. As a PayLab operator, I want Dashboard metrics hidden behind honest unavailable states before the report contract exists, so that placeholder numbers are never confused with real data.
21. As a PayLab operator, I want to browse Wallets when the Accounts endpoints exist, so that I can inspect PayLab Accounts.
22. As a PayLab operator, I want to open a Wallet and see its identity, currency, and derived Balance, so that I can understand its current financial position.
23. As a PayLab operator, I want to create a BRL Wallet when the API supports it, so that Account creation can be performed from the console.
24. As a PayLab operator, I want Account data scoped by the authenticated Merchant, so that the UI never implies cross-Merchant access.
25. As a PayLab operator, I want to browse Payments newest first when the list endpoint exists, so that recent activity is easiest to inspect.
26. As a PayLab operator, I want to filter Payments by Account, status, and period when supported by the API, so that I can investigate a specific flow.
27. As a PayLab operator, I want cursor-based pagination to follow the API contract, so that deep history remains stable and performant.
28. As a PayLab operator, I want to create a Payment with source Account, destination Account, Amount, currency, and a generated Idempotency Key, so that repeated submissions remain safe.
29. As a PayLab operator, I want submission disabled while the Payment request is in flight, so that accidental duplicate interaction is minimized without replacing backend idempotency.
30. As a PayLab operator, I want a successful creation to show the backend's final Payment state, so that synchronous September Settlement is represented accurately.
31. As a PayLab operator, I want insufficient funds shown as a `FAILED` Payment with reason `INSUFFICIENT_FUNDS`, so that a business outcome is not presented as a transport error.
32. As a PayLab operator, I want validation and API errors rendered from the backend error model, so that corrective action is clear.
33. As a PayLab operator, I want to open a Payment and inspect its source, destination, Amount, status, failure reason, timestamps, and linked Ledger Transaction when provided, so that intent and outcome are connected.
34. As a PayLab operator, I want Payment states limited to `CREATED`, `PROCESSING`, `SUCCEEDED`, and `FAILED`, so that the UI does not anticipate lifecycle states not implemented in September.
35. As a PayLab operator, I want Ledger Entry history for an Account when T11 exposes it, so that a Balance can be audited against its immutable entries.
36. As a PayLab operator, I want debit and credit direction visually distinct without relying on color alone, so that ledger meaning remains accessible.
37. As a PayLab operator, I want Ledger Transactions and their entries displayed only when the API exposes enough data, so that UI grouping never invents accounting relationships.
38. As a PayLab operator, I want a Payment's linked Ledger Transaction to be navigable when an API operation supports that lookup, so that the ledger fact can be traced from the Payment intent.
39. As an auditor, I want displayed Ledger Entries to preserve their integer Amount and direction semantics, so that the UI cannot imply a signed storage model the backend does not use.
40. As a developer, I want automated tests at user-visible seams, so that navigation, health, capability states, loading, errors, and critical money formatting survive refactors.
41. As a developer, I want test-controlled HTTP responses to exist only in the automated test environment, so that tests are deterministic without creating a runtime mock product.
42. As a developer, I want lint, type-check, unit/component tests, build, and API generation commands documented, so that contributors can validate changes consistently.
43. As a developer, I want the project handbook to explain how frontend capabilities map to backend tasks T8, T9, and T11, so that integration work follows backend readiness.
44. As a developer, I want no API keys or other credentials committed or bundled by default, so that the UI foundation does not normalize unsafe secret handling.
45. As a developer, I want authentication-dependent financial requests blocked until a supported credential flow is configured, so that the browser does not silently embed a Merchant API key.

## Implementation Decisions

- The UI lives in `paylab-ui/` beside `paylab-api/` within the existing PayLab Git repository.
- The stack is Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS v4, TanStack Query, Vitest, Testing Library, and Playwright.
- The package manager and baseline runtime align with the backend: pnpm and Node.js 20 or newer.
- The application uses a responsive operational-console shell with Dashboard, Accounts, Payments, Ledger, and System Health navigation.
- The running application has no mock transport, seed dataset, local persistence layer, or silent API fallback.
- HTTP contracts are generated from the backend OpenAPI document. Generated files are isolated from application adapters and are not manually edited.
- A repository command fetches or reads the backend OpenAPI document and regenerates the client. A checked-in schema snapshot may be used to make builds reproducible, but it contains contract metadata only.
- Capability Availability is derived from generated operations or an explicit compile-time capability registry built from them. Missing operations render a dedicated unavailable state.
- Only `GET /health` is live at the start. T8 enables Wallet creation/detail/Balance, T9 enables Payment creation/detail, and T11 enables Payment lists, Account Ledger Entry history, and Dashboard reports.
- The first foundation does not guess final response DTOs for T8–T11. UI feature adapters are added when those operations exist in OpenAPI.
- Money remains integer centavos at boundaries and is formatted for display with `Intl.NumberFormat`; calculations are not performed with formatted decimal strings.
- Server state is managed by TanStack Query. Local component state is limited to presentation and forms.
- Runtime configuration contains the API base URL only. No Merchant API key is committed, persisted, or placed in a default frontend environment file.
- Financial operations remain capability-unavailable until the backend provides both the endpoint and a browser-appropriate authentication configuration. September API-key provisioning remains a backend concern.
- The UI uses English copy and canonical domain names from `CONTEXT.md`.
- Reconciliation, Webhooks/processing, queue depth, DLQ, retries, and provider timelines remain future navigation candidates, not disabled menu clutter in this MVP.

## Testing Decisions

- Good tests verify observable behavior through rendered routes and accessible user interactions; they do not assert internal hook calls, query-cache internals, or shadcn/Radix implementation details.
- The primary seam is a rendered application route with controlled HTTP at the network boundary in tests. This validates routing, queries, state handling, and user-visible output together.
- Runtime code never activates the test transport. Controlled responses are loaded only by test setup.
- Unit tests are reserved for deterministic domain presentation such as BRL formatting and capability mapping.
- Component/integration tests cover the application shell, navigation, health success/disconnected/retry behavior, capability-unavailable states, and safe rendering of backend errors.
- A browser smoke test verifies that the built application loads, navigation works, and System Health can reach a configured real backend when one is available.
- API generation and TypeScript compilation provide the contract regression seam. Generated output must compile without handwritten patches.
- Initial validation commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.

## Out of Scope

- Runtime mock data, mock mode, demo seed data, localStorage persistence, or automatic fallback from API errors.
- Implementing or changing backend tasks T6–T11 from the frontend project.
- Handwritten speculative DTOs for Accounts, Payments, Ledger history, or reports before OpenAPI exposes them.
- User login, Merchant self-service, role-based access control, or embedding a Merchant API key in the browser.
- FakeBank integration, provider transactions, webhooks, reconciliation, queues, workers, Outbox, retries, DLQ, cache, and asynchronous status streaming.
- Refunds, reversals, cancellations, multi-currency, or future Payment states.
- Charts whose metrics are not backed by a real report endpoint.
- A standalone design system, complex animation system, white-label theming, or public marketing pages.
- Modifying the PayLab financial domain or treating the UI as a source of truth.

## Further Notes

- The inspected backend integration branch contains T1–T9 and the T11 read routes. These provide real Accounts, Payments, Ledger Entry history, and daily-report paths.
- The backend OpenAPI document currently omits financial request bodies, query parameters, response content, and component schemas. Financial UI remains unavailable until those contracts are described; routes alone are not treated as safe generated DTOs.
- The current backend CORS configuration does not yet allow `Idempotency-Key`, and T7 has not selected the Merchant API-key header. Those contracts must be completed before browser-based Payment creation can be enabled.
- The frontend is intentionally evolutionary: it should reveal new backend sophistication when that sophistication becomes real, without implementing future architecture ahead of the roadmap.
