# Tasks — Local Docker development

## Source Context
[PRD](PRD.md), sibling PROJECT.md and CONTEXT.md files, existing demo seed and UI server-client.

## Implementation Goal
Start the development API, UI, migrations, and isolated demo database with one command.

## Non-Goals
Production, benchmarks, destructive resets, financial behavior changes.

## Tasks
| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [T1](tasks/T1.md) | Complete Docker demo startup | — | done | [Context](task-runs/T1-CONTEXT.md) | [Summary](task-runs/T1-summary.md) |

## Acceptance Criteria Mapping
| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| AC-1 | T1 | Compose startup and health | done |
| AC-2 | T1 | Source reload smoke | done |
| AC-3 | T1 | Server-client tests, authenticated UI | done |
| AC-4 | T1 | Repeat startup and account identity | done |
| AC-5 | T1 | Documentation review | done |

## Test Strategy
Focused UI regression first, then Compose/HTTP startup, reload and persistence validation.

## Risk Plan
Dedicated database and credential volumes protect current data. Never reset on inconsistency. Bind ports to loopback. Lockfiles pin installs. Source mounts exclude secrets from image contexts.

## Execution Order
T1 only.

## Open Questions
No blocking open questions.

## Handoff
T1 completed and reviewed; no remaining runnable tasks.
