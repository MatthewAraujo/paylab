# Frontend dispatch — Benchmark Observability (paylab-ui)

Approved partition: F1 alone; then {F2, F3, F4}; then {F5 to F6, F7 to F9, F8 to F11}; then F10; then F12. One git worktree per concurrent lane, merged back by the orchestrator one at a time.

| Task | Lane | State | Notes |
| --- | --- | --- | --- |
| F1 | 1 | done (`caacdc0`) | contract refreshed; flags `benchmarks`, `benchmarkBaselineWrite`; API stopped |
| F2 | A | done (`975e926`, merged) | hooks, taxonomy, fixtures and stub |
| F3 | B | done (`f8e5ce8`, merged) | 80 new tests; rules API in `src/features/benchmarks/rules` |
| F4 | C | done (`b860557`, merged) | nav item, 4 route frames, badges, shared states |
| F5, F6 | A | waiting on F2, F3, F4 | |
| F7, F9 | B | waiting on F2, F3, F4 | |
| F8, F11 | C | waiting on F2, F3, F4 | |
| F10 | — | waiting on F6, F8, F9 | sync point: needs the Baseline line of the overview (F5/F6), the dialog (F8), and the comparison (F9) |
| F12 | — | waiting on all | |
