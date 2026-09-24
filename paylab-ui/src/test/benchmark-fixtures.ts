import type { components } from "@/api/generated/schema";

// Typed builders for the benchmark API's responses. Every builder returns a fresh, valid object
// that can be tweaked through `overrides`; the types come from the generated schema, so a
// contract change breaks compilation here before it can silently break a test. Test-only.

type Schemas = components["schemas"];

export type Metric = Schemas["MetricResponse"];
export type Scenario = Schemas["ScenarioResponse"];
export type RunListItem = Schemas["RunListItemResponse"];
export type RunDetail = Schemas["RunDetailResponse"];
export type RunProgress = Schemas["RunProgressResponse"];
export type RunPage = Schemas["RunPageResponse"];
export type Comparison = Schemas["ComparisonResponse"];
export type Trend = Schemas["TrendResponse"];
export type BaselineView = Schemas["BaselineResponse"];
export type BaselineSelection = Schemas["BaselineSelectionResponse"];
export type Artifact = Schemas["ArtifactResponse"];
export type ArtifactContent = Schemas["ArtifactContentResponse"];
export type GitState = Schemas["GitStateResponse"];
export type BenchmarkStatus = Schemas["BenchmarkStatusResponse"];

export function metric(overrides: Partial<Metric> = {}): Metric {
  return {
    key: "tps",
    label: "Settlements per second",
    unit: "tx/s",
    direction: "HIGHER_IS_BETTER",
    aggregation: "median",
    value: 164.4,
    ...overrides,
  };
}

export function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "t14.load.M.c64.sync-on",
    group: "t14",
    title: "Concurrency strategies: shape M, 64 clients, synchronous_commit=on",
    fingerprint: "fp-t14-m-64-on",
    protocol: {
      warmupMs: 2000,
      durationMs: 10000,
      repetitions: 3,
      aggregation: "median",
    },
    config: { shape: "M", clients: 64, sync: "on" },
    status: "COMPLETED",
    metrics: [metric()],
    ...overrides,
  };
}

export function gitState(overrides: Partial<GitState> = {}): GitState {
  return {
    available: true,
    baselineChangePending: false,
    dirtyFiles: [],
    dirtyCount: 0,
    ...overrides,
  };
}

export function runListItem(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    runId: "2026-09-23T14-08-12Z-8a2c91f",
    kind: "native",
    status: "COMPLETED",
    note: "After adding the settlement lookup index",
    source: { commit: "8a2c91f0d3b4e5a6", branch: "feature/settlement-index" },
    startedAt: "2026-09-23T14:08:12.000Z",
    finishedAt: "2026-09-23T15:26:36.000Z",
    durationMs: 4_704_000,
    dataset: {
      fingerprint: "f827ada9033d9ffa27971798ff908eff",
      description: "1001000 payments, 1000 wallets, 50 merchants",
    },
    environmentFingerprint: "env-1",
    scenarioCounts: {
      total: 1,
      pending: 0,
      active: 0,
      completed: 1,
      failed: 0,
    },
    headlineMetrics: [
      {
        scenarioId: "t14.load.M.c64.sync-on",
        key: "tps",
        label: "Settlements per second",
        unit: "tx/s",
        value: 164.4,
        summaryRole: "THROUGHPUT",
        dimensions: { strategy: "nokey" },
      },
    ],
    ...overrides,
  };
}

export function runDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    schemaVersion: 1,
    runId: "2026-09-23T14-08-12Z-8a2c91f",
    kind: "native",
    status: "COMPLETED",
    note: "After adding the settlement lookup index",
    source: { commit: "8a2c91f0d3b4e5a6", branch: "feature/settlement-index" },
    startedAt: "2026-09-23T14:08:12.000Z",
    finishedAt: "2026-09-23T15:26:36.000Z",
    durationMs: 4_704_000,
    executor: { version: "1" },
    environment: {
      fingerprint: "env-1",
      details: { node: "24.5.0", postgres: "16.15", cpuCount: "16" },
    },
    dataset: {
      fingerprint: "f827ada9033d9ffa27971798ff908eff",
      description: "1001000 payments, 1000 wallets, 50 merchants",
    },
    scenarios: [scenario()],
    artifacts: [],
    abandoned: false,
    ...overrides,
  };
}

export function runProgress(overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    runId: "live-1",
    status: "RUNNING",
    current: "t14.load.H.c16.sync-off",
    completed: 3,
    total: 17,
    scenarios: [
      {
        id: "t13.balance.hot-wallet",
        group: "t13",
        title: "Balance (hot Wallet)",
        status: "COMPLETED",
      },
      {
        id: "t14.load.H.c16.sync-off",
        group: "t14",
        title:
          "Concurrency strategies: shape H, 16 clients, synchronous_commit=off",
        status: "ACTIVE",
        startedAt: "2026-09-24T10:05:00.000Z",
      },
    ],
    abandoned: false,
    ...overrides,
  };
}

export function runPage(overrides: Partial<RunPage> = {}): RunPage {
  return {
    items: [runListItem()],
    nextCursor: null,
    skipped: [],
    ...overrides,
  };
}

export function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return {
    current: runListItem(),
    reference: runListItem({
      runId: "2026-09-16T18-30-00Z-3f9d0aa",
      startedAt: "2026-09-16T18:30:00.000Z",
    }),
    comparison: {
      environmentCompatible: true,
      datasetCompatible: true,
      scenarios: [
        { scenarioId: "t14.load.M.c64.sync-on", state: "comparable" },
      ],
    },
    ...overrides,
  };
}

export function trend(overrides: Partial<Trend> = {}): Trend {
  return {
    scenarioId: "t14.load.M.c64.sync-on",
    metricKey: "tps",
    dimensions: { strategy: "nokey" },
    label: "Settlements per second",
    unit: "tx/s",
    direction: "HIGHER_IS_BETTER",
    reference: {
      runId: "2026-09-23T14-08-12Z-8a2c91f",
      startedAt: "2026-09-23T14:08:12.000Z",
    },
    points: [
      {
        runId: "2026-09-16T18-30-00Z-3f9d0aa",
        startedAt: "2026-09-16T18:30:00.000Z",
        kind: "native",
        value: 151.2,
      },
      {
        runId: "2026-09-23T14-08-12Z-8a2c91f",
        startedAt: "2026-09-23T14:08:12.000Z",
        kind: "native",
        value: 164.4,
      },
    ],
    excluded: [],
    incompleteRuns: [],
    baselineRunId: null,
    ...overrides,
  };
}

export function baselineView(
  overrides: Partial<BaselineView> = {},
): BaselineView {
  return { baseline: null, run: null, git: gitState(), ...overrides };
}

export function baselineSelection(
  overrides: Partial<BaselineSelection> = {},
): BaselineSelection {
  return {
    baseline: {
      runId: "2026-09-16T18-30-00Z-3f9d0aa",
      selectedAt: "2026-09-24T09:00:00.000Z",
    },
    run: runListItem({ runId: "2026-09-16T18-30-00Z-3f9d0aa" }),
    git: gitState({
      baselineChangePending: true,
      dirtyFiles: ["bench/baseline.json"],
      dirtyCount: 1,
    }),
    changed: true,
    ...overrides,
  };
}

export function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "t14.load.M.c64.sync-on-log",
    kind: "LOG",
    label: "t14.load.M.c64.sync-on log",
    scenarioId: "t14.load.M.c64.sync-on",
    available: true,
    sizeBytes: 2048,
    ...overrides,
  };
}

export function artifactContent(
  overrides: Partial<ArtifactContent> = {},
): ArtifactContent {
  return {
    content: "started\nblock rep=1/3\n",
    offset: 0,
    nextOffset: null,
    sizeBytes: 22,
    ...overrides,
  };
}

export function benchmarkStatus(
  overrides: Partial<BenchmarkStatus> = {},
): BenchmarkStatus {
  return {
    enabled: true,
    runCount: 1,
    skippedRecords: 0,
    activeRunId: null,
    ...overrides,
  };
}

/** The API's 404 body for a missing Run or Artifact (has a `code`). */
export function notFoundBody(
  code:
    | "BENCHMARK_RUN_NOT_FOUND"
    | "BENCHMARK_ARTIFACT_NOT_FOUND"
    | "BENCHMARK_ARTIFACT_UNAVAILABLE" = "BENCHMARK_RUN_NOT_FOUND",
  message = "Not found.",
) {
  return { code, message };
}

/** The 404 a guarded route gives when the capability is off: no `code`. */
export function capabilityOffBody() {
  return { message: "Not Found", statusCode: 404 };
}

export function validationBody(
  code:
    | "VALIDATION_ERROR"
    | "BENCHMARK_RUN_NOT_COMPARABLE"
    | "BENCHMARK_BASELINE_INELIGIBLE" = "VALIDATION_ERROR",
  message = "Invalid request.",
) {
  return { statusCode: 422, code, message };
}
