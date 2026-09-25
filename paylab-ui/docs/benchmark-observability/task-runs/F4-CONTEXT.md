# F4 context pack (lane C)

- Goal: console shell for Benchmarks: nav entry, route frames, status/change/compatibility badges,
  metric value, copyable id, shared states. No data fetching, no rules.
- Read: PRD.md, tasks/F4.md, `PayLab-Benchmarks-source/` (visual reference only, never imported),
  `src/components/app-shell.tsx`, `src/components/ui/badge.tsx`, `capability-unavailable.tsx`,
  `src/api/current-capabilities.ts`, Next 16 docs for async `params`.
- Boundaries: `app-shell(+test)`, `ui/badge.tsx`, `globals.css`, `src/components/benchmarks/**`,
  `src/app/(console)/benchmarks/**`, this file and `F4-summary.md`. `TASKS.md` untouched.
- Constraints: meaning by text plus icon, never color alone; text-xs baseline; no new fonts or
  dependencies; no run/start/cancel/pause controls; absent metric is "Not recorded", never zero.
