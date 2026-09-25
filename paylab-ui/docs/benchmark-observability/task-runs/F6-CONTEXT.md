# F6 context pack — Active Run: progress and recent log

Spec: `../tasks/F6.md`. Stories: US-25..31. Lane A2; no log viewer here (F8 is another lane; the orchestrator wires it later).

## Inputs

- F2: `useRunProgress` (polls only while RUNNING and not abandoned, 3000 ms), `useArtifact`, `useArtifactContent`, `progressRefetchInterval` (the single place for the stop rules, already unit-tested).
- F5: the overview renders the panel for a RUNNING latest Run.
- Progress record: status, current, completed, total, scenarios (id, group, title, status), abandoned.

## Decisions

- One component, `ActiveRunPanel({ runId, startedAt, pollMs?, onSettled? })`, reused by the overview and, later, the Run detail.
- Elapsed time is computed at the last successful refresh (`dataUpdatedAt - startedAt`), so the value is honest about its freshness and needs no ticking timer.
- Pending count = total - completed - active - failed (the progress record may list fewer scenarios than `total`).
- The log Artifact of the active scenario is `<scenarioId>-log`; its size comes from the metadata (re-read after each successful progress refresh), and the last 4096 bytes are read at a bounded offset; a partial first line is dropped; the last 20 lines render as text in a `<pre>` outside any live region.
- Announcements: one polite status that changes only with the current scenario or a terminal state, never with log lines.
- `onSettled` fires once when the Run leaves RUNNING or is abandoned, so the overview refetches its Run list.
- No log viewer, no WebSocket or server-sent events.
