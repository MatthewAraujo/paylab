import { type Change, classifyChange } from "./classify";
import { metricIdentity } from "./identity";
import type {
  ComparisonState,
  Metric,
  MetricDirection,
  Scenario,
} from "./types";

/** One measurement of one scenario, on both sides of a comparison. */
export type MetricRow = {
  identity: string;
  key: string;
  label: string;
  unit: string;
  direction: MetricDirection;
  dimensions?: Record<string, string>;
  /** Undefined when the side did not record it (never zero). */
  current?: number;
  reference?: number;
  change: Change;
};

/**
 * Pairs the metrics of two scenarios by identity (key plus dimensions). The rows follow the
 * current side's order, then the metrics only the reference has. A metric on one side only is
 * "not recorded"; a recorded zero is a value.
 */
export function pairMetrics(
  current: readonly Metric[] | undefined,
  reference: readonly Metric[] | undefined,
): MetricRow[] {
  const referenceByIdentity = new Map(
    (reference ?? []).map((metric) => [metricIdentity(metric), metric]),
  );
  const seen = new Set<string>();
  const rows: MetricRow[] = [];

  const row = (identity: string, now?: Metric, before?: Metric): MetricRow => {
    const described = now ?? (before as Metric);
    return {
      identity,
      key: described.key,
      label: described.label,
      unit: described.unit,
      direction: described.direction,
      dimensions: described.dimensions,
      current: now?.value,
      reference: before?.value,
      change: classifyChange({
        current: now?.value,
        reference: before?.value,
        direction: described.direction,
      }),
    };
  };

  for (const metric of current ?? []) {
    const identity = metricIdentity(metric);
    seen.add(identity);
    rows.push(row(identity, metric, referenceByIdentity.get(identity)));
  }
  for (const metric of reference ?? []) {
    const identity = metricIdentity(metric);
    if (!seen.has(identity)) {
      rows.push(row(identity, undefined, metric));
    }
  }
  return rows;
}

export type MetricCounts = {
  improved: number;
  stable: number;
  regressed: number;
  /** Informational metrics: shown, never classified. */
  informational: number;
  /** Present on one side only. */
  notRecorded: number;
};

export function summarizeRows(rows: readonly MetricRow[]): MetricCounts {
  const counts: MetricCounts = {
    improved: 0,
    stable: 0,
    regressed: 0,
    informational: 0,
    notRecorded: 0,
  };
  for (const { change } of rows) {
    if (change.kind === "compared") {
      counts[change.classification] += 1;
    } else if (change.kind === "informational") {
      counts.informational += 1;
    } else {
      counts.notRecorded += 1;
    }
  }
  return counts;
}

export type ScenarioComparison = {
  scenarioId: string;
  state: ComparisonState;
  /** Empty unless the scenario is comparable: no delta is ever computed across a change. */
  rows: MetricRow[];
};

/** Rows only for a comparable scenario; every other state withholds the numbers. */
export function compareScenario(input: {
  scenarioId: string;
  state: ComparisonState;
  current?: Scenario;
  reference?: Scenario;
}): ScenarioComparison {
  const { scenarioId, state } = input;
  if (state !== "comparable") {
    return { scenarioId, state, rows: [] };
  }
  return {
    scenarioId,
    state,
    rows: pairMetrics(input.current?.metrics, input.reference?.metrics),
  };
}

export type ComparisonSummary = {
  scenarios: {
    comparable: number;
    new: number;
    removed: number;
    /** The scenario definition changed. */
    changed: number;
    /** The environment or the dataset differs. */
    incompatible: number;
  };
  /** Counted over comparable scenarios only. */
  metrics: MetricCounts;
};

export function summarizeComparison(
  comparisons: readonly ScenarioComparison[],
): ComparisonSummary {
  const scenarios = {
    comparable: 0,
    new: 0,
    removed: 0,
    changed: 0,
    incompatible: 0,
  };
  for (const { state } of comparisons) {
    if (
      state === "environment-incompatible" ||
      state === "dataset-incompatible"
    ) {
      scenarios.incompatible += 1;
    } else {
      scenarios[state] += 1;
    }
  }
  return {
    scenarios,
    metrics: summarizeRows(comparisons.flatMap(({ rows }) => rows)),
  };
}
