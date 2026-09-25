import {
  type Change,
  classifyChange,
  type HeadlineMetric,
  type MetricDirection,
  metricIdentity,
  type SummaryRole,
} from "@/features/benchmarks/rules";

/** The word for each declared role, in the order the overview presents them. */
export const ROLE_LABELS: Record<SummaryRole, string> = {
  THROUGHPUT: "Throughput",
  LATENCY_P99: "Latency p99",
  ERROR_RATE: "Error rate",
  DURATION: "Duration",
};

// A light Run item carries no direction, but a declared role does: more throughput is better,
// while latency, errors and duration are better when lower.
const ROLE_DIRECTION: Record<SummaryRole, MetricDirection> = {
  THROUGHPUT: "HIGHER_IS_BETTER",
  LATENCY_P99: "LOWER_IS_BETTER",
  ERROR_RATE: "LOWER_IS_BETTER",
  DURATION: "LOWER_IS_BETTER",
};

/** The same measurement in another Run's highlights: same scenario, key and dimensions. */
export function findCounterpart(
  metric: HeadlineMetric,
  others: readonly HeadlineMetric[] | undefined,
): HeadlineMetric | undefined {
  const identity = metricIdentity(metric);
  return others?.find(
    (other) =>
      other.scenarioId === metric.scenarioId &&
      other.summaryRole === metric.summaryRole &&
      metricIdentity(other) === identity,
  );
}

/** Direction-aware change of a highlight against the reference Run's counterpart. */
export function compareHeadline(
  metric: HeadlineMetric,
  reference: HeadlineMetric | undefined,
): Change {
  return classifyChange({
    current: metric.value,
    reference: reference?.value,
    direction: ROLE_DIRECTION[metric.summaryRole],
  });
}
