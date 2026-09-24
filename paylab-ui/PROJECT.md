# PayLab UI

## Overview

PayLab UI is the English-language Operational Console for the PayLab learning platform. It reveals real backend behavior without becoming a separate financial source of truth.

## Stack

- Next.js 16 App Router and React 19
- TypeScript
- shadcn/ui and Tailwind CSS v4
- TanStack Query for interactive remote state
- OpenAPI TypeScript and `openapi-fetch` for generated API integration
- Vitest and Testing Library
- Playwright
- Biome

## Structure

- `src/app/` — App Router pages and layouts
- `src/components/` — application and local shadcn components
- `src/features/` — feature-specific behavior such as System Health
- `src/api/` — capability detection and generated contract types
- `openapi/` — committed backend contract snapshot
- `tests/e2e/` — browser behavior tests
- `docs/` — PRD, plan, designer brief, and ADRs
- `PayLab-source/` — read-only designer prototype; never imported by production code

## Commands

- `pnpm dev` — local development server
- `pnpm build` — production build
- `pnpm start` — run the production build
- `pnpm lint` / `pnpm lint:fix` — Biome validation/formatting
- `pnpm typecheck` — TypeScript validation
- `pnpm test` — deterministic unit/component tests
- `pnpm test:e2e` — Chrome browser smoke tests
- `pnpm sync:api` — refresh OpenAPI snapshot and generated types from a running API
- `pnpm generate:api` — regenerate types from the existing snapshot

## Environment

- `NEXT_PUBLIC_PAYLAB_API_URL` is the API base URL (also used by the browser for `GET /health`). It defaults to `http://localhost:3333`.
- Demo data: in `paylab-api` run `pnpm demo:seed`, then `pnpm demo:dev`, and set `PAYLAB_API_KEY` to the printed "Demo Store" key ("Demo Rival" shows another Merchant's isolated data).
- `PAYLAB_API_KEY` is the server-only Merchant API key used by Server Components for financial reads (`src/api/server-client.ts`). Provision one with `pnpm merchant:provision` in `paylab-api`. Never place API keys or secrets in `NEXT_PUBLIC_*` variables.

## Current capability boundary

The console is read-only: no login and no create operations. Every view is live and reads through `createServerApiClient` on the server: Dashboard (daily report for a UTC range), Accounts (Wallet list, detail and Balance), Payments (list with filters, detail), Ledger (Ledger Entries per Wallet) and System Health. Regenerate the contract with `pnpm sync:api` after backend changes.

## Working rules

- Read `CONTEXT.md`, `docs/PRD.md`, and `docs/TASKS.md` before feature work.
- Use canonical domain names: Payment, Account, Wallet, Balance, Ledger Transaction, and Ledger Entry.
- Treat integer centavos as the money boundary; do not introduce floating-point financial state.
- Use generated OpenAPI DTOs rather than handwritten financial contracts.
- Fetch financial data only on the server with `createServerApiClient`; never in a Client Component.
- Do not add runtime mocks or silent API fallbacks.
- Keep Server Components as the default and introduce Client Components only for interaction or browser-side remote state.
- Follow red-green-refactor and keep tests at observable seams.
