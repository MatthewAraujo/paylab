# PayLab UI

Operational Console for the PayLab payment-processing and double-entry Ledger platform.

The application uses only the real `paylab-api`. It does not ship runtime mock records or silently fall back from failed API calls. The static files under `PayLab-source/` are a visual design reference and are not imported by the Next.js application.

## Requirements

- Node.js 20.9 or newer
- pnpm 10
- `paylab-api` running on `http://localhost:3333` for live System Health
- Google Chrome for the local Playwright configuration

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The root route redirects to `/dashboard`.

## API contract

The committed OpenAPI snapshot is generated from the backend and is the source for frontend API types.

```bash
pnpm sync:api
```

By default this reads `http://localhost:3333/docs-json`. Override it when necessary:

```bash
PAYLAB_OPENAPI_URL=https://api.example.com/docs-json pnpm sync:api
```

The current backend publishes financial paths but not request/response schemas, so Accounts, Payments, Ledger, and Dashboard stay intentionally unavailable. System Health uses the small existing runtime contract with explicit response validation.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Documentation

- Product scope: [`docs/PRD.md`](docs/PRD.md)
- Implementation plan: [`docs/TASKS.md`](docs/TASKS.md)
- Domain language: [`CONTEXT.md`](CONTEXT.md)
- Designer brief: [`docs/DESIGN-BRIEF.md`](docs/DESIGN-BRIEF.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
