# Frontend dispatch — Benchmark Observability (paylab-ui)

Approved partition: F1 alone; then {F2, F3, F4}; then {F5 to F6, F7 to F9, F8 to F11}; then F10; then F12. One git worktree per concurrent lane, merged back by the orchestrator one at a time.

| Task | Lane | State | Notes |
| --- | --- | --- | --- |
| F1 | 1 | done (`caacdc0`) | contract refreshed; flags `benchmarks`, `benchmarkBaselineWrite`; API stopped |
| F2 | A | done (`975e926`, merged) | hooks, taxonomy, fixtures and stub |
| F3 | B | done (`f8e5ce8`, merged) | 80 new tests; rules API in `src/features/benchmarks/rules` |
| F4 | C | done (`b860557`, merged) | nav item, 4 route frames, badges, shared states |
| F5, F6 | A (phase 3) | done (`46156fa`, `f1e0d6e`, merged) | overview and active-Run panel. Interrupted once by a rate limit and resumed |
| F7, F9 | B (phase 3) | done (`70a8bd9`, `c3e7803`, merged) | Run detail and Comparison; slots `renderArtifactAction`, `baselineAction`. Interrupted once by a rate limit and resumed |
| F8, F11 | C (phase 3) | done (`9cea405`, `eab66b1`, merged) | viewer exports `ArtifactViewerDialog`; local `ui/dialog.tsx`; trends view. Interrupted once by a rate limit and resumed |
| F10 | 4 | done (`10ba0ec` viewer wiring, `3177909` Baseline) | Baseline action on Run detail and Comparison; Git notice on overview; CORS PUT to verify in F12 smoke |
| F12 | 5 | done (`db87c25`, `55de5e3`, `730cf20`) | smoke e2e, a11y checks, docs; manual checklist and real-API CORS unverified |
