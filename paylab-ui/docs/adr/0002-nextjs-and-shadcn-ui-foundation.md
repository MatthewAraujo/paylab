# ADR 0002: Use Next.js App Router and shadcn/ui

## Status

Accepted

## Context

The Operational Console needs a maintainable React foundation, file-based routes for list and detail screens, accessible interface primitives, and enough styling control to reproduce the approved operational-console design. The original plan named Vite, React Router, and Material UI. Before implementation, the project owner selected Next.js and shadcn/ui instead.

The designer handoff is a static HTML/CSS/JavaScript prototype. It is visual evidence, not an implementation base, and contains runtime illustrative data that the production application must not carry.

## Decision

Use Next.js with the App Router, React, and TypeScript. Use Tailwind CSS v4 and locally owned shadcn/ui components for the interface foundation.

Use Server Components by default and Client Components only where browser interaction or TanStack Query is required. Keep generated OpenAPI code and remote-state adapters outside page components. Preserve the designer prototype under `PayLab-source/` as a read-only visual reference during implementation.

Use pnpm and Node.js 20.9 or newer. Use Biome for linting/formatting, Vitest and Testing Library for deterministic behavior tests, and Playwright for browser smoke coverage.

## Consequences

- Application routes and layouts use Next.js file-system conventions instead of React Router configuration.
- shadcn/ui component source is part of this repository and may be adapted to the PayLab visual tokens.
- Tailwind tokens must reproduce the approved hierarchy without copying the prototype's monolithic CSS.
- Client boundaries must stay deliberate; the entire console must not become a single client-rendered component.
- The static prototype cannot be copied as production JavaScript or used as a runtime mock mode.
- The earlier Vite/Material UI stack choice is superseded.
