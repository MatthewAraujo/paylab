# PayLab Operational Console — Design Brief

## Purpose

Design the first visual system and core screens for **PayLab**, a fictional payment-processing and double-entry ledger platform.

PayLab is an engineering laboratory, not a consumer banking product. The frontend is an **Operational Console**: an internal interface that makes backend behavior understandable, inspectable, and demonstrable.

The visual design should help an operator answer:

- Is the platform reachable and healthy?
- What financial activity happened?
- What state is a Payment in?
- Which Accounts were affected?
- Which debit and credit entries prove the movement?
- Is a feature unavailable because the backend has not exposed it yet?

The UI language is **English**.

## Product context

PayLab evolves incrementally:

1. Financial core: Accounts, Payments, double-entry Ledger, Balance, and reports.
2. FakeBank integration and external-provider failures.
3. Cloud infrastructure.
4. Load and architecture experiments.
5. Asynchronous processing, queues, retries, idempotent consumers, and reconciliation.
6. Observability, health, security, and incident simulation.

The first design must represent the financial core well without visually pretending that later capabilities already exist.

## Current backend reality

At the time of this brief:

- PostgreSQL schema, ledger integrity rules, and core Account/Payment domain models exist.
- Only `GET /health` is publicly available.
- Accounts, Payments, Ledger history, and reports are planned backend capabilities.
- The application will use the real API only. It will not silently replace missing endpoints with runtime mock data.
- Designs may use clearly illustrative records to communicate layout, density, and hierarchy. Illustrative content is not an API contract.

## Experience principles

### Operational, not promotional

The interface should feel like a serious internal financial-operations tool. Prioritize clarity, density, traceability, and confidence over marketing visuals.

### The ledger is evidence

A Payment is an intent and lifecycle. A Ledger Transaction and its Ledger Entries are the accounting fact. The design should make that relationship easy to understand.

### Honest system state

Loading, empty, error, disconnected, and capability-unavailable states are first-class screens. Never use placeholder metrics that could be mistaken for real financial data.

### Progressive sophistication

The shell should support future operational areas without placing unfinished features in the initial navigation. The information architecture may grow later, but the first version stays focused.

### Accessible meaning

Status, debit/credit direction, success, and failure cannot rely on color alone. Use text, icons, shape, or position as additional signals.

## Visual direction

The desired character is:

- precise;
- calm;
- trustworthy;
- technical;
- modern, but not fashionable for its own sake;
- data-dense without feeling cramped;
- recognizably financial without imitating a consumer bank.

Avoid:

- generic admin-template styling;
- excessive gradients or glassmorphism;
- cryptocurrency visual language;
- neon trading-terminal aesthetics;
- oversized cards with little information;
- decorative charts without real metrics;
- animation that delays operational work;
- visual treatment that makes illustrative data look live.

The designer may propose light, dark, or dual themes. The recommendation is a restrained dark operational shell with high-contrast content surfaces, but readability and hierarchy are more important than theme preference.

## Primary navigation

The initial navigation contains:

1. **Dashboard**
2. **Accounts**
3. **Payments**
4. **Ledger**
5. **System Health**

Do not include Reconciliation, Webhooks, Queue, DLQ, FakeBank, or Provider Operations in the initial navigation. Those may be added when corresponding backend capabilities exist.

The shell needs:

- PayLab identity;
- active-section indication;
- desktop navigation;
- responsive mobile/tablet navigation;
- API connectivity or health indication;
- page title and optional supporting description;
- space for page-level actions;
- predictable content width and spacing.

## Required responsive frames

Provide at least:

- desktop: approximately 1440 px wide;
- compact desktop/tablet: approximately 1024 px wide;
- mobile: approximately 390 px wide.

Dense tables may become cards, horizontal scroll regions, or reduced-column lists on small screens. Financial identifiers and Amounts must remain readable.

## Screen requirements

### 1. Dashboard

Purpose: provide a concise operational overview when the reporting endpoint becomes available.

Future real metrics:

- total Payment volume;
- Payment count;
- count or distribution by status;
- later, success rate and latency only when the API exposes them.

Required initial states:

- capability unavailable;
- loading;
- empty reporting period;
- API error with retry;
- populated report concept.

Do not design queue depth, provider latency, or distributed tracing into the initial populated state.

### 2. Accounts list or entry surface

Purpose: find and inspect Wallets.

The current backend plan does not yet guarantee a list endpoint. Provide two compatible concepts:

- a Wallet list/table if listing becomes available;
- a direct Account lookup/empty entry surface if only read-by-id is available.

Potential information:

- Account identifier;
- Account kind (`WALLET`);
- currency (`BRL`);
- derived Balance;
- creation time, only if returned by the API.

Potential actions:

- create Wallet;
- open Account details;
- inspect Ledger Entries.

Required states:

- capability unavailable;
- empty;
- loading;
- error;
- populated;
- create form validation;
- successful creation.

### 3. Account detail

Purpose: explain an Account's identity and how its Balance was reached.

Required information when available:

- Account identifier;
- kind;
- currency;
- derived Balance;
- Ledger Entry history;
- cursor pagination or “load more” behavior.

Balance means credits minus debits. It is derived from the Ledger and must not look like an independently editable field.

### 4. Payments list

Purpose: inspect recent Payment activity and find a specific Payment.

Potential columns or list content:

- Payment identifier;
- creation time;
- source Account;
- destination Account;
- Amount;
- status;
- failure reason when applicable.

Planned filters:

- Account;
- status;
- date/time period.

Pagination is cursor-based underneath but presented as Previous, numbered pages and Next. Only pages known to exist are numbered (visited pages and the next one); there is no total and no jump-ahead, because the API has no offset.

Required states:

- capability unavailable;
- loading;
- empty;
- error with retry;
- populated;
- filtered with no results;
- next-page loading.

### 5. Create Payment

Purpose: create a synchronous September Payment through the real API.

Fields when the endpoint is available:

- source Account;
- destination Account;
- Amount in BRL;
- Idempotency Key, generated by the client and optionally visible as technical metadata.

Required interaction states:

- initial;
- field validation;
- submitting;
- `SUCCEEDED` result;
- `FAILED` result with `INSUFFICIENT_FUNDS`;
- request or transport error.

A `FAILED` Payment is a valid business outcome, not the same visual state as an HTTP or network error.

The submit action must become unavailable while the request is in flight. Backend idempotency remains the correctness guarantee.

### 6. Payment detail

Purpose: connect Payment intent, lifecycle outcome, Accounts, and the Ledger fact.

Required information when returned by the API:

- Payment identifier;
- Amount and currency;
- status;
- failure reason;
- source Account;
- destination Account;
- created and updated timestamps;
- linked Ledger Transaction identifier for a successful Payment.

Initial lifecycle states are only:

```text
CREATED → PROCESSING → SUCCEEDED | FAILED
```

Do not introduce `WAITING_PROVIDER`, `PENDING`, `CANCELLED`, `REFUNDED`, or `REVERSED` in the initial design.

A compact lifecycle treatment may be designed, but it must not invent transition timestamps that the API does not provide.

Illustrative content for layout only:

```text
PAY-000184
R$ 350.90

Status
SUCCEEDED

Source Account
ACC-001

Destination Account
ACC-037

Ledger Transaction
LT-000184
```

### 7. Ledger

Purpose: inspect immutable debit and credit evidence.

Two levels may eventually exist:

- Account Ledger Entry history, planned in the backend;
- Ledger Transaction detail and grouped entries, not yet guaranteed by an API endpoint.

Potential entry information:

- Ledger Entry identifier;
- Ledger Transaction identifier;
- Account identifier;
- direction (`DEBIT` or `CREDIT`);
- positive Amount;
- creation time.

Important accounting rules to express visually:

- direction is stored separately from Amount;
- Amount is positive, never a signed floating-point value;
- a Ledger Transaction contains at least two entries;
- debits and credits balance to zero;
- entries are immutable;
- a failed Payment has no Ledger Transaction.

Illustrative balanced pair:

```text
DEBIT   ACC-001   R$ 350.90
CREDIT  ACC-037   R$ 350.90
```

Do not imply that operators can edit or delete Ledger Entries.

### 8. System Health

Purpose: show the only currently live frontend integration.

The present endpoint returns:

- `status`;
- `app`;
- `environment`.

Required states:

- checking;
- healthy;
- unreachable/disconnected;
- error detail appropriate for an operator;
- manual refresh.

Do not invent database, queue, worker, or provider component health before the API exposes it.

## Shared state patterns

Design reusable patterns for:

### Loading

- page-level initial loading;
- inline action loading;
- next-page loading;
- refresh loading that does not erase already visible data unnecessarily.

### Empty

Distinguish:

- no records exist;
- filters returned no records;
- a reporting period has no activity.

### Error

Distinguish:

- API unreachable;
- unauthorized;
- not found;
- validation error;
- retryable server error;
- business outcome such as insufficient funds.

### Capability unavailable

This state means the backend has not exposed the required OpenAPI operation or authentication contract yet.

It should:

- be calm and intentional, not look like a crash;
- state what capability is pending;
- avoid fake metrics and records;
- optionally identify the relevant backend milestone, such as Accounts API, Payments API, or read/report API;
- not expose internal engineering detail that would confuse a non-developer operator.

### Status vocabulary

Design status treatments for:

- `CREATED`;
- `PROCESSING`;
- `SUCCEEDED`;
- `FAILED`;
- healthy;
- disconnected;
- capability unavailable.

All treatments require a text label and sufficient contrast.

## Data presentation rules

### Money

- The underlying API value is integer centavos.
- Display BRL using locale-aware formatting, for example `R$ 350.90` or the selected English-locale equivalent.
- Align Amounts consistently in tables.
- Never present editable floating-point accounting values.

### Identifiers

- Real identifiers may be UUIDs and can be long.
- Provide a compact display treatment with access to the full value.
- Copy-to-clipboard may be proposed for technical identifiers.
- Truncation must not make two identifiers indistinguishable in the same context.

### Date and time

- Use one consistent format and timezone treatment.
- Preserve access to the exact timestamp where operational comparison matters.
- Relative time may supplement, but not replace, an exact timestamp.

### Tables

- Support scanning and comparison.
- Keep row actions predictable.
- Define responsive behavior.
- Avoid using large card grids for naturally tabular financial records.

## Accessibility requirements

- Target WCAG 2.2 AA contrast and interaction expectations.
- All navigation and actions must work with a keyboard.
- Focus must be visible.
- Form controls require persistent labels and useful error association.
- Icon-only actions require accessible names and tooltips where helpful.
- Status and debit/credit direction cannot rely on color alone.
- Tables require meaningful headers and responsive alternatives that preserve context.
- Loading and result changes should be understandable to assistive technology.
- Motion should respect reduced-motion preferences.

## Design system scope

Create only the component vocabulary needed for this console:

- application shell;
- navigation item;
- page header;
- metric card;
- status badge;
- connectivity indicator;
- table and pagination controls;
- filter controls;
- form fields and action groups;
- loading, empty, error, and unavailable states;
- Amount, timestamp, and technical identifier display;
- Ledger Entry row or group;
- confirmation/feedback messaging.

The implementation will use shadcn/ui with Tailwind CSS. The design may customize the local shadcn components substantially, but should remain practical to build without a separate design-system project.

## Content and tone

Use concise operational English.

Prefer:

- “API unreachable”
- “No payments in this period”
- “Accounts API is not available yet”
- “Payment failed: insufficient funds”
- “Refresh health status”

Avoid:

- playful banking copy;
- vague errors such as “Something went wrong” without useful context;
- claiming that unavailable features are “coming soon” unless a roadmap date is intentionally shown;
- exposing implementation jargon where it does not help the operator.

## Expected design deliverables

Please provide:

1. Visual direction or compact mood board.
2. Foundations: color, typography, spacing, elevation, borders, icons, and responsive grid.
3. Desktop and mobile application shell.
4. The eight screen concepts listed above.
5. Loading, empty, error, disconnected, unauthorized, not-found, and capability-unavailable states.
6. Payment lifecycle and status treatments.
7. Ledger debit/credit treatment and balanced-entry grouping.
8. Core interactive component states: default, hover, focus, active, disabled, loading, validation error, and success.
9. Responsive behavior notes for tables, navigation, forms, and detail layouts.
10. A handoff showing reusable components, tokens, measurements, and asset exports.

## Designer freedom

The designer owns:

- composition and information hierarchy within these requirements;
- typography and visual rhythm;
- color system and theme recommendation;
- table density and responsive transformations;
- iconography;
- subtle motion and transition proposals;
- how technical identifiers, status, and traceability are made easy to scan.

The designer should flag any requirement that harms clarity or usability and propose an alternative with the same operational meaning.

## Non-negotiable constraints

- UI copy is English.
- The product is an Operational Console, not a consumer banking app.
- No runtime mock mode or fake production data.
- No unsupported future capabilities presented as live.
- No editable or deletable Ledger Entries.
- No future Payment states in the initial design.
- No charts with invented metrics.
- No API keys or secrets shown as ordinary persistent frontend configuration.
- Money and ledger direction semantics must remain correct.
- The design must include unavailable, empty, loading, error, and disconnected states.

## Engineering review after handoff

When design code or implementation artifacts are returned, engineering will compare them against:

- domain vocabulary and financial invariants;
- the current OpenAPI contract;
- capability availability;
- responsive and accessibility requirements;
- loading, empty, error, and unavailable behavior;
- Payment lifecycle correctness;
- Ledger traceability;
- security constraints around authentication and secrets;
- implementation feasibility with Next.js, React, TypeScript, shadcn/ui, Tailwind CSS, and the planned test strategy.

Visual choices may change during that review when required to preserve correctness, accessibility, or API truthfulness.
