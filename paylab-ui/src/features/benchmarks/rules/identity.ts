import type { Metric } from "./types";

type WithDimensions = Pick<Metric, "dimensions">;

const sortedDimensions = (metric: WithDimensions): [string, string][] =>
  Object.entries(metric.dimensions ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

/**
 * What a measurement is: its key plus its dimensions. Two metrics with the same key but another
 * strategy are different measurements, so this is the only safe way to pair them across Runs.
 */
export function metricIdentity(metric: Pick<Metric, "key"> & WithDimensions) {
  const parts = sortedDimensions(metric).map(
    ([name, value]) => `${name}=${value}`,
  );
  return [metric.key, ...parts].join("|");
}

/** The dimensions as readable text ("strategy: nokey"), or empty when there are none. */
export function dimensionLabel(metric: WithDimensions): string {
  return sortedDimensions(metric)
    .map(([name, value]) => `${name}: ${value}`)
    .join(", ");
}
