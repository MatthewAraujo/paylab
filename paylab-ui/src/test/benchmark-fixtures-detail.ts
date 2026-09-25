import {
  type Artifact,
  artifact,
  type Metric,
  metric,
  type RunDetail,
  runDetail,
  runListItem,
  type Scenario,
  scenario,
} from "./benchmark-fixtures";

// Run-detail and comparison fixtures composed from the base builders: a full native Run, a
// large concurrency Run, an Incomplete Run and the three Imported records. Test-only.

export const NATIVE_RUN_ID = "2026-09-23T14-08-12Z-8a2c91f";
export const INCOMPLETE_RUN_ID = "2026-09-22T09-00-00Z-77aa11c";

const tps = (value: number, strategy?: string) =>
  metric({
    key: "tps",
    label: "Settlements per second",
    unit: "tx/s",
    direction: "HIGHER_IS_BETTER",
    value,
    summaryRole: "THROUGHPUT",
    ...(strategy ? { dimensions: { strategy } } : {}),
  });

const p99 = (value: number, strategy?: string) =>
  metric({
    key: "latency_p99",
    label: "Latency p99",
    unit: "ms",
    direction: "LOWER_IS_BETTER",
    value,
    summaryRole: "LATENCY_P99",
    ...(strategy ? { dimensions: { strategy } } : {}),
  });

export function t13Scenario(overrides: Partial<Scenario> = {}): Scenario {
  return scenario({
    id: "t13.balance.hot-wallet",
    group: "t13",
    title: "Balance (hot Wallet)",
    fingerprint: "fp-t13-balance-hot",
    protocol: { warmupRuns: 2, repetitions: 5, aggregation: "median" },
    config: { wallet: "hot" },
    metrics: [
      metric({
        key: "duration_ms",
        label: "Query duration",
        unit: "ms",
        direction: "LOWER_IS_BETTER",
        value: 62.1,
        aggregation: "median",
      }),
    ],
    ...overrides,
  });
}

export function t14Scenario(overrides: Partial<Scenario> = {}): Scenario {
  return scenario({
    metrics: [
      tps(164.4, "nokey"),
      tps(151.9, "keyed"),
      p99(48.2, "nokey"),
      p99(55.7, "keyed"),
    ],
    ...overrides,
  });
}

/** A small completed Run: two groups, strategy dimensions and an unknown future metric. */
export function nativeCompletedRun(
  overrides: Partial<RunDetail> = {},
): RunDetail {
  return runDetail({
    scenarios: [
      t13Scenario(),
      t14Scenario({
        metrics: [
          ...t14Scenario().metrics,
          metric({
            key: "future_gauge",
            label: "Future gauge",
            unit: "widgets",
            direction: "NEUTRAL",
            value: 7,
            aggregation: undefined,
          }),
        ],
      }),
    ],
    artifacts: [
      artifact(),
      artifact({
        id: "t13.balance.hot-wallet-plan",
        kind: "QUERY_PLAN",
        label: "t13.balance.hot-wallet: plan.txt",
        scenarioId: "t13.balance.hot-wallet",
        sizeBytes: 3_400_000,
      }),
      artifact({
        id: "t14.load.M.c64.sync-on-raw",
        kind: "RAW_DATA",
        label: "t14.load.M.c64.sync-on: raw.json",
        scenarioId: "t14.load.M.c64.sync-on",
        available: false,
        sizeBytes: undefined,
      }),
    ],
    ...overrides,
  });
}

/** A concurrency Run large enough that nothing may be laid out up front. */
export function largeConcurrencyRun(scenarioCount = 20): RunDetail {
  const scenarios = Array.from({ length: scenarioCount }, (_, index) =>
    scenario({
      id: `t14.load.S${index}`,
      group: "t14",
      title: `Concurrency case ${index}`,
      fingerprint: `fp-${index}`,
      metrics: Array.from({ length: 10 }, (_, key) =>
        metric({
          key: `m${key}`,
          label: `Metric ${index}.${key}`,
          unit: "ms",
          direction: "LOWER_IS_BETTER",
          value: key + 1,
        }),
      ),
    }),
  );
  return runDetail({ scenarios, artifacts: [] });
}

/** A Run that failed in its third scenario after two completed ones. */
export function incompleteRun(overrides: Partial<RunDetail> = {}): RunDetail {
  return runDetail({
    runId: INCOMPLETE_RUN_ID,
    status: "INCOMPLETE",
    note: undefined,
    finishedAt: "2026-09-22T09:31:00.000Z",
    durationMs: 1_860_000,
    scenarios: [
      t13Scenario(),
      t14Scenario(),
      scenario({
        id: "t14.load.H.c16.sync-off",
        title: "Concurrency strategies: shape H, 16 clients",
        status: "FAILED",
        startedAt: "2026-09-22T09:20:00.000Z",
        finishedAt: "2026-09-22T09:31:00.000Z",
        metrics: [],
      }),
    ],
    failure: {
      scenarioId: "t14.load.H.c16.sync-off",
      command: "pnpm bench:load --shape H --clients 16",
      exitStatus: 137,
      summary: "Scenario t14.load.H.c16.sync-off exited with status 137",
    },
    artifacts: [
      artifact({
        id: "t14.load.H.c16.sync-off-log",
        label: "t14.load.H.c16.sync-off log",
        scenarioId: "t14.load.H.c16.sync-off",
      }),
    ],
    ...overrides,
  });
}

export type ImportedKind = "t13-baseline" | "t13-adopted" | "t14";

const imported: Record<
  ImportedKind,
  { runId: string; source: string; scenarios: Scenario[] }
> = {
  "t13-baseline": {
    runId: "imported-t13-baseline",
    source: "docs/experiments/T13-results.md#baseline",
    scenarios: [t13Scenario()],
  },
  "t13-adopted": {
    runId: "imported-t13-adopted",
    source: "docs/experiments/T13-results.md#adopted",
    scenarios: [t13Scenario({ metrics: [metric({ value: 41.3 })] })],
  },
  t14: {
    runId: "imported-t14",
    source: "docs/experiments/T14-results.md",
    scenarios: [t14Scenario()],
  },
};

/** An Imported record: commit and branch are unknown, and it carries its evidence file. */
export function importedRun(kind: ImportedKind): RunDetail {
  const record = imported[kind];
  return runDetail({
    runId: record.runId,
    kind: "imported",
    note: undefined,
    source: { commit: "unknown", branch: "unknown" },
    startedAt: "2026-06-10T12:00:00.000Z",
    finishedAt: "2026-06-10T12:20:00.000Z",
    durationMs: 1_200_000,
    executor: { version: "imported" },
    imported: { source: record.source },
    scenarios: record.scenarios,
    artifacts: [
      artifact({
        id: `${kind}-evidence`,
        label: "Recorded evidence",
        legacyFile: record.source,
        scenarioId: undefined,
        available: true,
        sizeBytes: 9_000,
      }),
    ],
  });
}

export type { Artifact };

export const CURRENT_RUN_ID = "2026-09-23T14-08-12Z-8a2c91f";
export const REFERENCE_RUN_ID = "2026-09-16T18-30-00Z-3f9d0aa";

const m = (
  key: string,
  direction: Metric["direction"],
  value: number,
  unit = "ms",
): Metric => metric({ key, label: `Label ${key}`, unit, direction, value });

/**
 * Two Runs and the API's verdict on them, covering every scenario state and every kind of
 * metric change: the exact +5% boundary, an improvement, a regression from zero, 0 to 0, an
 * informational metric and a metric recorded on one side only.
 */
export function comparisonFixture() {
  const sc = (id: string, group: string, metrics: Metric[]) =>
    scenario({ id, group, title: `Title of ${id}`, metrics });

  const current = runDetail({
    runId: CURRENT_RUN_ID,
    scenarios: [
      sc("t14.a", "t14", [
        m("tps", "HIGHER_IS_BETTER", 105, "tx/s"),
        m("p99", "LOWER_IS_BETTER", 40),
        m("errors", "LOWER_IS_BETTER", 3, "count"),
        m("deadlocks", "LOWER_IS_BETTER", 0, "count"),
        m("samples", "NEUTRAL", 100, "count"),
        m("only_current", "LOWER_IS_BETTER", 9),
      ]),
      sc("t13.b", "t13", [m("b", "LOWER_IS_BETTER", 1)]),
      sc("t14.d", "t14", [m("d", "LOWER_IS_BETTER", 1)]),
      sc("t14.e", "t14", [m("e", "LOWER_IS_BETTER", 1)]),
      sc("t14.f", "t14", [m("f", "LOWER_IS_BETTER", 1)]),
    ],
  });
  const reference = runDetail({
    runId: REFERENCE_RUN_ID,
    scenarios: [
      sc("t14.a", "t14", [
        m("tps", "HIGHER_IS_BETTER", 100, "tx/s"),
        m("p99", "LOWER_IS_BETTER", 50),
        m("errors", "LOWER_IS_BETTER", 0, "count"),
        m("deadlocks", "LOWER_IS_BETTER", 0, "count"),
        m("samples", "NEUTRAL", 90, "count"),
        m("only_reference", "LOWER_IS_BETTER", 8),
      ]),
      sc("t13.c", "t13", [m("c", "LOWER_IS_BETTER", 1)]),
      sc("t14.d", "t14", [m("d", "LOWER_IS_BETTER", 2)]),
      sc("t14.e", "t14", [m("e", "LOWER_IS_BETTER", 2)]),
      sc("t14.f", "t14", [m("f", "LOWER_IS_BETTER", 2)]),
    ],
  });

  return {
    current,
    reference,
    response: {
      current: runListItem({ runId: CURRENT_RUN_ID }),
      reference: runListItem({
        runId: REFERENCE_RUN_ID,
        startedAt: "2026-09-16T18:30:00.000Z",
      }),
      comparison: {
        environmentCompatible: true,
        datasetCompatible: true,
        scenarios: [
          { scenarioId: "t14.a", state: "comparable" as const },
          { scenarioId: "t13.b", state: "new" as const },
          { scenarioId: "t13.c", state: "removed" as const },
          { scenarioId: "t14.d", state: "changed" as const },
          { scenarioId: "t14.e", state: "environment-incompatible" as const },
          { scenarioId: "t14.f", state: "dataset-incompatible" as const },
        ],
      },
    },
  };
}
