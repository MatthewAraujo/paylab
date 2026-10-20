# PRD — Local Docker development

## Problem Statement
Starting the API, console and demo database requires separate host commands and manual credential setup.

## Solution
One root Docker Compose command starts both applications in development with hot reload and persistent, isolated demo data.

## User Stories
1. As a developer, I want one command to start both applications without host Node.js tooling.
2. As a developer, I want source edits reflected automatically.
3. As a developer, I want demo data and authentication ready automatically and retained across restarts.
4. As a developer, I want existing development and benchmark databases preserved.

## Acceptance Criteria
- **AC-1** (story 1): `docker compose up --build` from the workspace root starts PostgreSQL, applies existing migrations, initializes demo data, and starts API and UI on localhost ports 3333 and 3000.
- **AC-2** (story 2): Editing application source updates the running development servers without rebuilding images.
- **AC-3** (story 3): UI server reads authenticate as Demo Store automatically; the browser uses the host API address; the Merchant key stays server-only and is never tracked.
- **AC-4** (stories 3, 4): Repeated startup preserves demo data and credentials without duplication. The stack uses its own database volume and does not expose a PostgreSQL host port or modify existing Compose databases.
- **AC-5** (story 1): Documentation explains startup, addresses, shutdown, and dependency rebuilds.

## Implementation Decisions
Development-only images use pinned per-repository pnpm versions and frozen lockfiles. A one-shot initializer reuses the demo plan and seeder, sharing the generated key through a private Docker volume. Explicit internal API configuration applies only to server reads. Existing local demo guards remain unchanged. Root Docker documentation lives alongside this scoped PRD so benchmark specifications remain intact.

## Testing Decisions
Validate at Compose and HTTP boundaries: configuration, first startup, authenticated account data, rendered UI, source reload, and repeat startup. Add a focused server-client regression covering internal API routing and explicit URL override precedence. No tests asserting Dockerfile text. Inspect initialization/install scripts before execution.

## Out of Scope
Production deployment, benchmark execution, database resets, changes to financial behavior, and host dependency installation.

## Further Notes
User approved development mode and demo data. Initialization must fail explicitly on mismatched credentials rather than resetting data.
