import type { HeadlineMetric, SummaryRole } from "./types";

/** The summary roles the API can declare, in the order the overview presents them. */
export const HEADLINE_ROLES: readonly SummaryRole[] = [
  "THROUGHPUT",
  "LATENCY_P99",
  "ERROR_RATE",
  "DURATION",
];

export type HeadlineScenario = {
  scenarioId: string;
  metrics: HeadlineMetric[];
};

/**
 * The highlights a Run itself declared (through a summary role), grouped by scenario in the order
 * the Run lists them. Nothing here guesses a headline from a metric name or a position.
 */
export function headlineScenarios(
  metrics: readonly HeadlineMetric[],
): HeadlineScenario[] {
  const byScenario = new Map<string, HeadlineMetric[]>();
  for (const metric of metrics) {
    const group = byScenario.get(metric.scenarioId);
    if (group) {
      group.push(metric);
    } else {
      byScenario.set(metric.scenarioId, [metric]);
    }
  }
  return [...byScenario].map(([scenarioId, group]) => ({
    scenarioId,
    metrics: group,
  }));
}

/** The scenario featured until the operator picks another: the first that declares highlights. */
export function defaultHeadlineScenario(
  groups: readonly HeadlineScenario[],
): string | null {
  return groups[0]?.scenarioId ?? null;
}

/**
 * Highlights by role. Only declared roles are present, so a role the Run did not declare (today
 * the error rate) can be shown as "not declared" instead of being guessed.
 */
export function headlineByRole(
  metrics: readonly HeadlineMetric[],
): Partial<Record<SummaryRole, HeadlineMetric[]>> {
  const byRole: Partial<Record<SummaryRole, HeadlineMetric[]>> = {};
  for (const role of HEADLINE_ROLES) {
    const declared = metrics.filter((metric) => metric.summaryRole === role);
    if (declared.length > 0) {
      byRole[role] = declared;
    }
  }
  return byRole;
}
