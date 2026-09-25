import type { HeadlineMetric } from "@/features/benchmarks/rules";
import { type BenchmarkApiStub, json } from "./benchmark-api-stub";
import {
  type BaselineView,
  baselineView,
  type Comparison,
  comparison,
  type Metric,
  metric,
  type RunDetail,
  type RunListItem,
  type RunPage,
  runDetail,
  runListItem,
  runPage,
  scenario,
} from "./benchmark-fixtures";

// Composed data for the overview and the active-Run tests. Built only from the base builders.

export const LATEST_ID = "2026-09-23T14-08-12Z-8a2c91f";
export const PREVIOUS_ID = "2026-09-16T18-30-00Z-3f9d0aa";
export const LOAD_SCENARIO = "t14.load.M.c64.sync-on";
export const READ_SCENARIO = "t13.balance.hot-wallet";

export function headline(
  overrides: Partial<HeadlineMetric> = {},
): HeadlineMetric {
  return {
    scenarioId: LOAD_SCENARIO,
    key: "tps",
    label: "Settlements per second",
    unit: "tx/s",
    value: 164.4,
    summaryRole: "THROUGHPUT",
    dimensions: { strategy: "nokey" },
    ...overrides,
  };
}

const p99 = (value: number): Metric =>
  metric({
    key: "p99",
    label: "Latency p99",
    unit: "ms",
    direction: "LOWER_IS_BETTER",
    value,
  });

const tps = (value: number): Metric => metric({ value });

/** Highlights of a Run: throughput and p99 of the load scenario, duration of the read scenario. */
export function headlines(values: {
  tps: number;
  p99: number;
  duration: number;
}): HeadlineMetric[] {
  return [
    headline({ value: values.tps }),
    headline({
      key: "p99",
      label: "Latency p99",
      unit: "ms",
      value: values.p99,
      summaryRole: "LATENCY_P99",
    }),
    headline({
      scenarioId: READ_SCENARIO,
      key: "duration",
      label: "Balance read duration",
      unit: "ms",
      value: values.duration,
      summaryRole: "DURATION",
      dimensions: undefined,
    }),
  ];
}

const twoCompleted = {
  total: 2,
  pending: 0,
  active: 0,
  completed: 2,
  failed: 0,
};

export function latestItem(overrides: Partial<RunListItem> = {}): RunListItem {
  return runListItem({
    runId: LATEST_ID,
    scenarioCounts: twoCompleted,
    headlineMetrics: headlines({ tps: 164.4, p99: 41, duration: 12 }),
    ...overrides,
  });
}

export function previousItem(
  overrides: Partial<RunListItem> = {},
): RunListItem {
  return runListItem({
    runId: PREVIOUS_ID,
    startedAt: "2026-09-16T18:30:00.000Z",
    finishedAt: "2026-09-16T19:40:00.000Z",
    note: undefined,
    source: { commit: "3f9d0aa0000000", branch: "main" },
    scenarioCounts: twoCompleted,
    headlineMetrics: headlines({ tps: 151.2, p99: 30, duration: 12 }),
    ...overrides,
  });
}

const readScenario = () =>
  scenario({
    id: READ_SCENARIO,
    group: "t13",
    title: "Balance (hot Wallet)",
    metrics: [
      metric({
        key: "duration",
        label: "Balance read duration",
        unit: "ms",
        direction: "LOWER_IS_BETTER",
        value: 12,
      }),
    ],
  });

export function latestDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return runDetail({
    runId: LATEST_ID,
    scenarios: [
      scenario({ id: LOAD_SCENARIO, metrics: [tps(164.4), p99(41)] }),
      readScenario(),
    ],
    ...overrides,
  });
}

export function previousDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return runDetail({
    runId: PREVIOUS_ID,
    startedAt: "2026-09-16T18:30:00.000Z",
    scenarios: [
      scenario({ id: LOAD_SCENARIO, metrics: [tps(151.2), p99(30)] }),
      readScenario(),
    ],
    ...overrides,
  });
}

export function defaultComparison(
  overrides: Partial<Comparison> = {},
): Comparison {
  return comparison({
    current: latestItem(),
    reference: previousItem(),
    comparison: {
      environmentCompatible: true,
      datasetCompatible: true,
      scenarios: [
        { scenarioId: LOAD_SCENARIO, state: "comparable" },
        { scenarioId: READ_SCENARIO, state: "comparable" },
      ],
    },
    ...overrides,
  });
}

export type OverviewData = {
  /** Pages of the Run list keyed by the cursor that requests them ("" is the first page). */
  pages?: Record<string, RunPage>;
  details?: RunDetail[];
  comparison?: Comparison | Response;
  baseline?: BaselineView | Response;
};

const asResponse = (value: object | Response) =>
  value instanceof Response ? value : json(value);

/** Registers the overview's reads on the stub. Anything omitted keeps the settled default. */
export function serveOverview(stub: BenchmarkApiStub, data: OverviewData = {}) {
  const pages = data.pages ?? {
    "": runPage({ items: [latestItem(), previousItem()] }),
  };
  const details = data.details ?? [latestDetail(), previousDetail()];

  stub.on("GET", "/v1/benchmarks/runs", ({ query }) => {
    const page = pages[query.get("cursor") ?? ""];
    return page ? json(page) : json({ message: "unknown cursor" }, 400);
  });
  stub.on("GET", "/v1/benchmarks/runs/:runId", ({ params }) => {
    const detail = details.find((run) => run.runId === params.runId);
    return detail
      ? json(detail)
      : json({ code: "BENCHMARK_RUN_NOT_FOUND", message: "Not found." }, 404);
  });
  stub.on(
    "GET",
    "/v1/benchmarks/comparisons/default",
    asResponse(data.comparison ?? defaultComparison()),
  );
  stub.on(
    "GET",
    "/v1/benchmarks/baseline",
    asResponse(data.baseline ?? baselineView()),
  );
  return stub;
}
