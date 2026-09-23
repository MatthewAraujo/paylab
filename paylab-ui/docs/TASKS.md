# Tasks — PayLab Operational Console MVP

## Source Context

- Frontend scope and acceptance criteria: [PRD.md](PRD.md).
- Visual requirements and designer handoff: [DESIGN-BRIEF.md](DESIGN-BRIEF.md).
- Frontend domain language: [CONTEXT.md](../CONTEXT.md).
- API client decision: [ADR 0001](adr/0001-generate-api-client-from-openapi.md).
- Product roadmap: Notion page “PayLab — Payment Processing & Ledger Platform”.
- Backend handbook and domain language: `../paylab-api/PROJECT.md` and `../paylab-api/CONTEXT.md`.
- Backend scope and task status: `../paylab-api/docs/PRD.md` and `../paylab-api/docs/TASKS.md`.
- Backend contracts currently inspected: `GET /health`, Swagger document setup, CORS configuration, Prisma schema, `Account`, `Amount`, and `Payment` domain types.
- Backend readiness at implementation time: Accounts, Payments, Account Ledger Entry history, and daily-report routes exist on the inspected integration branch. Their OpenAPI operations have no typed request/response schemas, so only `GET /health` is currently safe to integrate.

## Implementation Goal

Create a production-oriented Next.js and TypeScript Operational Console in `paylab-ui/` that talks exclusively to the real PayLab API, exposes live System Health immediately, provides a polished responsive shell for Dashboard, Accounts, Payments, and Ledger, and shows honest capability-unavailable states until OpenAPI contains the required financial operations.

## Non-Goals

- Runtime mocks, demo financial records, localStorage persistence, or silent API fallbacks.
- Speculative financial DTOs or request contracts not present in OpenAPI.
- Backend implementation or changes to T6–T11.
- Browser storage or bundling of Merchant API keys.
- Reconciliation, FakeBank, webhooks, provider timelines, queues, retries, DLQ, cache, or asynchronous streaming.
- Refunds, reversals, cancellations, multi-currency, or future Payment states.
- A standalone design-system package, white labeling, marketing pages, or elaborate animation.

## Acceptance Criteria Mapping

| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| US-1..4 shell, English UI, navigation, responsive layout | T1, T3 | component, e2e | done |
| US-5 money formatting | T2 | unit | done |
| US-6 consistent date/time presentation | T2 | unit | planned with first timestamp surface |
| US-7..10 loading, empty, error, unavailable states | T2, T3, T4 | unit, component | partially done; empty state awaits first typed list |
| US-11 API base URL configuration | T1, T4 | unit, build | done |
| US-12..15 generated client and capability detection | T2 | generation, typecheck, unit | done |
| US-16..18 live health, refresh, disconnected state | T4 | component/integration, e2e | done |
| US-19..20 Dashboard report and honest unavailable state | T3, T8 | component; integration after T11 | partially blocked by backend T11 |
| US-21..24 Wallet browse/detail/create/scoping | T3, T5 | component; integration after T8 | blocked by backend T8 and browser authentication contract |
| US-25..34 Payment browse/create/detail/lifecycle/errors | T3, T6 | component; integration after T9/T11 | blocked by backend T9/T11 and browser authentication contract |
| US-35..39 Ledger history, directions, grouping, traceability | T3, T7 | component; integration after T11 | blocked by backend T11 and a Ledger Transaction lookup contract |
| US-40..41 observable test seams and test-only HTTP control | T1–T4 | unit, component, e2e | done |
| US-42 validation commands and documentation | T1, T9 | command validation, docs review | done |
| US-43 backend capability mapping | T3, T9 | docs review | done |
| US-44 no bundled credentials | T1, T2, T9 | repository scan, build inspection | done |
| US-45 authentication-dependent requests blocked | T3, T5–T7 | component, integration after backend T7 | planned/blocked by backend T7 |

## T1 — Generate the frontend foundation

Objective:

Create the minimal Next.js App Router/React/TypeScript foundation, package scripts, test harnesses, environment validation, and baseline project documentation required by the approved PRD.

Affected files / areas:

- Package manifest and pnpm workspace metadata.
- Next.js App Router, Tailwind CSS v4, shadcn/ui, TypeScript, Biome, Vitest, Testing Library, and Playwright configuration.
- Application entry point and minimal root component.
- Environment example, ignore rules, README, and PROJECT handbook.

Test-first plan:

- Add one rendered-application smoke test that initially fails because the app entry surface does not exist.
- Add the minimum application root needed to pass.
- Add a build-level environment validation test for a valid and missing API base URL.

Implementation notes:

- Use Node.js 20.9+, pnpm, Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS v4, and TanStack Query.
- Keep the foundation minimal; do not implement financial features.
- Test-only HTTP tooling must not be imported by production entry points.
- Install dependencies only after explicit user approval.

Dependencies:

None.

Completion signal:

The project installs, the minimal app renders, lint/typecheck/test/build commands pass, and a contributor can run it from documented instructions.

## T2 — Establish API generation, shared presentation, and capabilities

Objective:

Create the OpenAPI generation boundary and the small shared modules needed to present API state safely.

Affected files / areas:

- OpenAPI snapshot and generation configuration.
- Generated client directory and handwritten client adapter boundary.
- Capability registry.
- BRL Amount and date/time formatters.
- Reusable loading, empty, error, and capability-unavailable views.

Test-first plan:

- Write a unit test proving known operations map to capabilities and missing operations remain unavailable.
- Write formatter tests using independent literals for centavos and timestamps.
- Write rendered-state tests for loading, empty, retryable error, and unavailable output.
- Generate the client and prove generated output compiles without manual edits.

Implementation notes:

- Prefer a lightweight fetch-based OpenAPI generator.
- Never hand-edit generated files.
- Do not define speculative Account, Payment, or Ledger DTOs outside generated output.
- A schema-only snapshot is allowed for reproducible builds; runtime example records are not.

Dependencies:

T1.

Completion signal:

API generation is repeatable, generated code type-checks, capability detection is deterministic, shared states are accessible, and no runtime mock path exists.

## T3 — Build the responsive Operational Console shell

Objective:

Implement the English-language navigation and routes for Dashboard, Accounts, Payments, Ledger, and System Health with a coherent operational visual hierarchy.

Affected files / areas:

- Theme and global styles.
- Designer handoff and tokens from `docs/DESIGN-BRIEF.md`, when available.
- Responsive shell, sidebar/drawer, header, page container, and route configuration.
- Dashboard, Accounts, Payments, and Ledger route shells.
- Capability status messaging and backend-task dependency copy.

Test-first plan:

- Write a rendered-route test for keyboard-accessible navigation between all MVP sections.
- Implement the smallest shell that passes.
- Add responsive drawer behavior and active-route indication tests.
- Add one test per financial route proving unavailable capabilities display no invented metrics or records.

Implementation notes:

- Optimize for an internal payment-operations console, not a generic admin template.
- Do not expose future Reconciliation or Webhooks navigation yet.
- Color cannot be the only status or debit/credit signal.

Dependencies:

T1, T2.

Completion signal:

All routes are navigable and responsive, System Health is clearly distinct, and unavailable financial routes contain useful next-dependency information but no fake data.

## T4 — Integrate live System Health

Objective:

Connect System Health to the real `GET /health` endpoint with refresh, loading, success, and disconnected behavior.

Affected files / areas:

- Health query adapter and query hook.
- System Health page.
- API connectivity indicator in the shell.
- Test-only network setup and browser smoke configuration.

Test-first plan:

- Write a route-level test for a successful response containing status, app, and environment.
- Implement the minimum query and page to pass.
- Add disconnected and retry behavior one case at a time.
- Add a browser smoke test that can target a configured real API; skip with an explicit message when the API is not supplied.

Implementation notes:

- Use TanStack Query for remote state.
- Test-controlled HTTP exists only in test setup.
- Do not infer component health beyond the fields returned by the API.

Dependencies:

T1, T2, T3.

Completion signal:

System Health displays real backend identity and status, refreshes on demand, distinguishes an unreachable API, and passes route-level tests.

## T5 — Activate Accounts when backend T8 is available

Objective:

Replace the Accounts unavailable state with live Wallet creation, detail, and Balance behavior generated from the backend contract.

Affected files / areas:

- Generated API client refresh.
- Accounts query and mutation adapters.
- Account list/detail/create UI as supported by the final API contract.
- Authentication configuration.

Test-first plan:

- Start with the first observable operation present in OpenAPI.
- Add one route-level behavior test, implement it, and proceed vertically through Balance and creation.
- Exercise 401, not-found, validation, empty, and retryable error behavior from the final contract.

Implementation notes:

- Do not begin until backend T8 and a browser-safe authentication decision exist.
- If T8 does not include a Wallet list operation, do not invent one; adjust the navigation to supported entry points.
- Balance always comes from the API and is presented as derived ledger state.

Dependencies:

T4; external dependency on backend T7 and T8.

Completion signal:

Every enabled Account interaction is backed by a generated operation and route-level tests, with no embedded credential or handwritten DTO.

## T6 — Activate Payments when backend T9 and T11 are available

Objective:

Enable Payment creation, detail, list, filters, and cursor pagination as the corresponding OpenAPI operations appear.

Affected files / areas:

- Generated API client refresh.
- Payment query/mutation adapters and forms.
- Payment list, detail, lifecycle status, error, and failure-reason views.

Test-first plan:

- Begin with creation or detail according to the first available operation.
- Verify the Idempotency Key is sent exactly as the backend contract requires.
- Add `SUCCEEDED` and `FAILED`/`INSUFFICIENT_FUNDS` outcomes as separate vertical slices.
- Add list filtering and cursor navigation only after T11 exposes them.

Implementation notes:

- Do not treat a `FAILED` Payment as an HTTP error.
- Disable duplicate form interaction while a request is pending, but rely on backend idempotency for correctness.
- Do not add future lifecycle states.
- Backend CORS must allow the final idempotency and authentication headers before enabling browser creation.

Dependencies:

T5; external dependency on backend T9 for create/detail and T11 for list/filter/pagination.

Completion signal:

Enabled Payment workflows use only generated operations, preserve backend outcomes, and pass route-level tests for critical paths.

## T7 — Activate Ledger inspection when backend read contracts are available

Objective:

Enable Account Ledger Entry history and Payment-to-Ledger traceability without inventing transaction grouping or relationships.

Affected files / areas:

- Generated API client refresh.
- Ledger queries and route adapters.
- Ledger Entry history and, if supported, Ledger Transaction detail.

Test-first plan:

- Render Account history from the real T11 contract, checking newest-first order and cursor navigation.
- Verify debit and credit have text/icon distinctions in addition to color.
- Add Payment-to-Ledger navigation only when the lookup operation exists.

Implementation notes:

- T11 guarantees Account Ledger Entry history but does not currently define a Ledger Transaction detail endpoint.
- Keep unsupported grouping unavailable and document the backend contract gap.

Dependencies:

T5; external dependency on backend T11 and any future Ledger Transaction lookup endpoint.

Completion signal:

All displayed accounting relationships come directly from the API, directions are accessible, and unsupported grouping remains explicitly unavailable.

## T8 — Activate Dashboard metrics when backend T11 is available

Objective:

Replace the Dashboard unavailable state with daily Payment count and volume by status from the real report endpoint.

Affected files / areas:

- Generated API client refresh.
- Report query adapter.
- Metric cards and restrained data visualization if justified by the returned series.

Test-first plan:

- Render known report values from controlled test HTTP and verify counts and BRL Amounts independently.
- Add empty range, loading, error, and refresh behavior.
- Add visualization only after table/card semantics pass.

Implementation notes:

- Do not calculate authoritative totals from a partially paginated Payment list.
- Do not add success-rate or latency metrics until the API exposes them.

Dependencies:

T4; external dependency on backend T11.

Completion signal:

Dashboard values are backed solely by the report operation and remain correct under loading, empty, and error states.

## T9 — Complete handbook, CI, and integration handoff

Objective:

Document the project and add repeatable quality gates for the foundation and each future capability activation.

Affected files / areas:

- README and PROJECT handbook.
- CI workflow and dependency update configuration.
- Environment and API generation documentation.
- Capability-to-backend-task matrix.

Test-first plan:

- Run the documented commands from a clean install.
- Verify no tracked environment file contains a credential.
- Verify generated output has no manual diff after regeneration from the same schema.
- Run lint, typecheck, unit/component tests, e2e smoke where configured, and production build.

Implementation notes:

- Keep PROJECT.md operational and concise; rationale stays in ADRs.
- CI must not require a live financial API for deterministic frontend tests.
- A real-API browser smoke may be optional until the backend deployment exists.

Dependencies:

T1–T4 for the initial foundation; update after each of T5–T8.

Completion signal:

A contributor can install, generate, run, test, and build the UI from documentation, and CI enforces the same fast gates.

## Test Strategy

- Unit: environment parsing, Amount/date formatting, and capability mapping.
- Component/integration: rendered routes through Router and Query providers, with test-only HTTP control at the network boundary.
- Contract: regenerate the client from the pinned OpenAPI document and type-check all handwritten adapters.
- E2E: browser navigation and optional live `GET /health` smoke against a configured API.
- Accessibility: semantic queries in Testing Library, keyboard navigation, focus behavior, labels, and non-color status cues.
- Visual/manual: responsive shell at narrow and wide viewports; loading, error, empty, and unavailable states.
- Expected commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm generate:api`, and `pnpm build`.

## Risk Plan

- Contract drift: generate from OpenAPI and fail typecheck rather than maintaining handwritten financial DTOs.
- Backend incompleteness: render capability-unavailable states; never substitute runtime mocks.
- Authentication: do not bundle or persist a Merchant API key. Keep financial actions unavailable until the backend contract and browser security model are explicit.
- CORS: Payment creation needs headers not currently allowed by the backend. Treat this as an external dependency, not a frontend workaround.
- Money correctness: keep centavos as integers and test presentation with fixed independent examples.
- Generated-code churn: isolate generated output and wrap only at feature boundaries.
- UI overbuild: keep one shadcn/Tailwind token set and a small shared-state vocabulary; do not create a separate component package.
- Test leakage: ensure test HTTP setup is unreachable from production entry points and production bundles.
- E2E flakiness: keep deterministic UI tests independent of a live backend; make the live health smoke explicit and bounded.

## Execution Order

1. T1 generates and validates the minimum project foundation.
2. T2 establishes the OpenAPI boundary, capabilities, formatters, and shared remote states.
3. T3 builds the responsive shell and honest unavailable routes.
4. T4 integrates live System Health, completing the currently achievable operational slice.
5. T9 documents and gates that initial foundation.
6. T5 activates Accounts after backend T7/T8.
7. T6 activates Payment create/detail after T9, then list/filter after T11.
8. T7 activates Ledger history after T11 and transaction detail only if a contract is added.
9. T8 activates Dashboard reports after T11.

The application must remain buildable and honest after every step. Blocked tasks do not justify speculative types or runtime data.

## Open Questions

No blocking product questions for T1–T4 and the initial T9 documentation pass.

External contract questions before T5–T8:

- Which request header will carry the Merchant API key in backend T7, and is direct browser use acceptable for this internal lab?
- Will backend CORS explicitly allow the authentication and `Idempotency-Key` headers?
- Will Accounts gain a list endpoint, since T8 currently specifies only create and read-by-id?
- Will the API expose Ledger Transaction detail, since T11 currently specifies only Account Ledger Entry history?

## Handoff to TDD

Ready for TDD after plan approval. Start with T1 and write the rendered-application smoke test before the minimal application root.
