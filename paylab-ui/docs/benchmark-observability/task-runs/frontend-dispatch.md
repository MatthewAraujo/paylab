# Frontend dispatch — Benchmark Observability (paylab-ui)

Approved partition: F1 alone; then {F2, F3, F4}; then {F5 to F6, F7 to F9, F8 to F11}; then F10; then F12. One git worktree per concurrent lane, merged back by the orchestrator one at a time.

| Task | Lane | State | Notes |
| --- | --- | --- | --- |
| F1 | 1 | done (`caacdc0`) | contract refreshed; flags `benchmarks`, `benchmarkBaselineWrite`; API stopped |
| F2 | A | dispatched | own worktree |
| F3 | B | dispatched | own worktree |
| F4 | C | dispatched | own worktree |
| F5, F6 | A | waiting on F2, F3, F4 | |
| F7, F9 | B | waiting on F2, F3, F4 | |
| F8, F11 | C | waiting on F2, F3, F4 | |
| F10 | — | waiting on F6, F8, F9 | sync point: needs the Baseline line of the overview (F5/F6), the dialog (F8), and the comparison (F9) |
| F12 | — | waiting on all | |
