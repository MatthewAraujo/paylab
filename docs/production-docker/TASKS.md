# Tasks — Production-local Docker

## Source Context
[PRD](PRD.md), [design handoff](../infra-production-handoff.md), root and sibling PROJECT.md/CONTEXT.md files, root `compose.yaml`, development Dockerfiles, API Docker demo initializer, `scripts/check-docker-reload.py`, UI `next.config.ts` and server client.

## Implementation Goal
Add a production-local Compose stack with multi-stage non-root images, migrations and demo initialization before API availability, healthchecks, restart policies, isolated volumes, a gitignored environment file and a documented manual backup/restore, leaving the development stack unchanged.

## Non-Goals
Reverse proxy, TLS, public domain, login, remote deployment, registries, automated backups, credential rotation, initializer rule changes, benchmark execution, resets, financial behavior changes.

## Tasks
| Task | Title | Depends on | Status | Context | Summary |
| --- | --- | --- | --- | --- | --- |
| [T1](tasks/T1.md) | API production image and initializer target | — | ready | — | — |
| [T2](tasks/T2.md) | Console production image | — | ready | — | — |
| [T3](tasks/T3.md) | Production-local stack end to end | T1, T2 | planned | — | — |
| [T4](tasks/T4.md) | Persistence, recovery and failure modes | T3 | planned | — | — |
| [T5](tasks/T5.md) | Backup, restore, documentation and development regression | T3 | planned | — | — |

## Acceptance Criteria Mapping
| Acceptance Criterion | Task(s) | Test(s) | Status |
| --- | --- | --- | --- |
| AC-1 | T2, T5 | UI commands; dev Compose and reload check | planned |
| AC-2 | T3 | Compose config, port bindings | planned |
| AC-3 | T3 | Project/volume listing | planned |
| AC-4 | T3 | Smoke: authenticated API and console | planned |
| AC-5 | T4 | Smoke restart flag: Wallet ids | planned |
| AC-6 | T4 | Throwaway mismatch run | planned |
| AC-7 | T1, T3, T4 | Init ordering, failed migration run | planned |
| AC-8 | T1, T2 | Image tool absence checks | planned |
| AC-9 | T1, T2 | `id -u` checks | planned |
| AC-10 | T3 | Compose health status | planned |
| AC-11 | T4 | Smoke kill flag | planned |
| AC-12 | T1, T3 | HTML/inspect/git checks | planned |
| AC-13 | T3 | Missing env file run, git check-ignore | planned |
| AC-14 | T5 | Backup command | planned |
| AC-15 | T5 | Restore drill | planned |
| AC-16 | T5 | Documentation review | planned |

## Test Strategy
Container/Compose/HTTP boundary only; no tests asserting Dockerfile or Compose text. `scripts/check-production-stack.py` covers the running stack with opt-in restart/kill flags. Failure modes (missing env file, credential mismatch, failed migration) run in throwaway Compose projects and are recorded manually. Regression: dev `docker compose config --quiet`, `scripts/check-docker-reload.py`, existing API/UI typecheck, lint and tests.

## Risk Plan
- Data loss: separate project and volumes; never remove non-throwaway volumes; restore only on production-local after a fresh backup.
- Secrets: required gitignored env file; no build args; key only in a private volume, read-only in console; smoke never prints it.
- Development regression: development Dockerfiles and `compose.yaml` untouched; standalone output behind a switch.
- Port conflict: both stacks use 3000/3333; stop one before starting the other.
- Registry timeouts (seen in local-docker T1): reuse pnpm cache mounts and fetch settings.
- Prisma Client lost by production pruning: verified by T1 runtime health check.

## Execution Order
T1 and T2 (independent), then T3, then T4 and T5.

## Open Questions
No blocking open questions.

## Handoff
Ready for `task-runner`. Start with T1 (T2 can run in parallel).
