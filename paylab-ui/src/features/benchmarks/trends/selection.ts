import type { Scenario } from "../rules";

export type TrendSelection = {
  scenarioId: string | undefined;
  metric: string | undefined;
  dimensions: Record<string, string>;
};

export type Dimensions = Record<string, string>;

/** Reads the trend selection from the address: `scenario`, `metric`, repeated `dimension=key:value`. */
export function parseSelection(params: URLSearchParams): TrendSelection {
  const dimensions: Dimensions = {};
  for (const entry of params.getAll("dimension")) {
    const at = entry.indexOf(":");
    if (at > 0) {
      dimensions[entry.slice(0, at)] = entry.slice(at + 1);
    }
  }
  return {
    scenarioId: params.get("scenario") || undefined,
    metric: params.get("metric") || undefined,
    dimensions,
  };
}

/** The query string (without `?`) that reproduces a selection. */
export function selectionToQuery(selection: TrendSelection): string {
  const params = new URLSearchParams();
  if (selection.scenarioId) params.set("scenario", selection.scenarioId);
  if (selection.metric) params.set("metric", selection.metric);
  for (const [key, value] of Object.entries(selection.dimensions)) {
    params.append("dimension", `${key}:${value}`);
  }
  return params.toString();
}

export type MetricOption = { key: string; label: string; unit: string };

const scenarioOf = (scenarios: readonly Scenario[], scenarioId?: string) =>
  scenarios.find((scenario) => scenario.id === scenarioId);

/** Each metric of a scenario once, whatever number of dimension variants it has. */
export function metricsOf(
  scenarios: readonly Scenario[],
  scenarioId?: string,
): MetricOption[] {
  const seen = new Map<string, MetricOption>();
  for (const metric of scenarioOf(scenarios, scenarioId)?.metrics ?? []) {
    if (!seen.has(metric.key)) {
      seen.set(metric.key, {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
      });
    }
  }
  return [...seen.values()];
}

/** The dimension sets a metric has in a scenario; empty when it has no dimensions. */
export function dimensionsOf(
  scenarios: readonly Scenario[],
  scenarioId: string | undefined,
  metricKey: string | undefined,
): Dimensions[] {
  const variants = new Map<string, Dimensions>();
  for (const metric of scenarioOf(scenarios, scenarioId)?.metrics ?? []) {
    const dimensions = metric.dimensions ?? {};
    if (metric.key === metricKey && Object.keys(dimensions).length > 0) {
      variants.set(JSON.stringify(dimensions), dimensions);
    }
  }
  return [...variants.values()];
}

export function dimensionLabel(dimensions: Dimensions): string {
  const entries = Object.entries(dimensions);
  return entries.length === 0
    ? "No dimension"
    : entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

/**
 * The selection the view shows: what the address chose, completed with defaults from the
 * newest Run's scenarios. An address value that is not among the options is kept, so a shared
 * link says what it asked for instead of silently showing something else.
 */
export function resolveSelection(
  selection: TrendSelection,
  scenarios: readonly Scenario[],
): TrendSelection {
  const scenarioId = selection.scenarioId ?? scenarios[0]?.id;
  const metric = selection.metric ?? metricsOf(scenarios, scenarioId)[0]?.key;
  const hasDimensions = Object.keys(selection.dimensions).length > 0;
  const dimensions = hasDimensions
    ? selection.dimensions
    : (dimensionsOf(scenarios, scenarioId, metric)[0] ?? {});

  return { scenarioId, metric, dimensions };
}
