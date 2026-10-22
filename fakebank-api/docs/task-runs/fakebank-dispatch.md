# FakeBank October MVP — dispatch

Orchestrator: main session. One fresh subagent per task, `task-runner` in lane mode (each runs `tdd` and commits its own task). The orchestrator owns `docs/TASKS.md`.

| Task | Lane | State |
| --- | --- | --- |
| T1 | A | done (60428ef) |
| T2 | A | done (0311f50) |
| T3 | A | done (7b0cfb9) |
| T4 | A | done (15d4464) |
| T5 | A | done (e1256b5) |
| T6 | A | dispatched |
| T7 | A | waiting (T6) |
| T8 | A | waiting (T7) |
| T9 | B | dispatched (alongside T4–T8) |

Lane B path boundary: `fakebank-api/Dockerfile`, `fakebank-api/.dockerignore`, `fakebank-api/docker-compose.yml`, workspace `compose.yaml`, workspace `PROJECT.md`, `fakebank-api/PROJECT.md`, and its own task-run files. While T9 runs, lane A does not edit `fakebank-api/PROJECT.md`; it lists needed changes in its summary instead.
