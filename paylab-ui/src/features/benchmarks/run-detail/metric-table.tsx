import { MetricValue } from "@/components/benchmarks/metric-value";
import {
  dimensionLabel,
  formatNumber,
  type Metric,
  type MetricDirection,
  metricIdentity,
  NOT_RECORDED,
} from "../rules";

const DIRECTIONS: Record<MetricDirection, string> = {
  HIGHER_IS_BETTER: "Higher is better",
  LOWER_IS_BETTER: "Lower is better",
  NEUTRAL: "Informational",
};

/** A metric's direction in words; an unknown future direction is shown as it arrived. */
export function directionLabel(direction: MetricDirection): string {
  return DIRECTIONS[direction] ?? String(direction);
}

/**
 * The measurements of one scenario. The metric identity (label, dimensions, key) stays visible
 * while the table scrolls sideways inside a labelled, keyboard-focusable region.
 */
export function MetricTable({
  scenarioTitle,
  metrics,
}: Readonly<{ scenarioTitle: string; metrics: readonly Metric[] }>) {
  if (metrics.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This scenario recorded no measurements.
      </p>
    );
  }

  return (
    <section
      aria-label={`Metrics of ${scenarioTitle}, scrollable`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard reachable
      tabIndex={0}
      className="overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table
        aria-label={`Metrics of ${scenarioTitle}`}
        className="w-full min-w-[36rem] border-collapse text-xs"
      >
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="sticky left-0 bg-muted px-3 py-2">
              Metric
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Value
            </th>
            <th scope="col" className="px-3 py-2">
              Direction
            </th>
            <th scope="col" className="px-3 py-2">
              Aggregation
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const dimensions = dimensionLabel(metric);
            return (
              <tr key={metricIdentity(metric)} className="border-t">
                <th
                  scope="row"
                  className="sticky left-0 bg-background px-3 py-2 text-left font-normal"
                >
                  <span className="block font-medium">{metric.label}</span>
                  {dimensions ? (
                    <span className="block text-muted-foreground">
                      {dimensions}
                    </span>
                  ) : null}
                  <code className="font-mono text-muted-foreground">
                    {metric.key}
                  </code>
                </th>
                <td className="px-3 py-2 text-right">
                  <MetricValue
                    value={
                      typeof metric.value === "number"
                        ? formatNumber(metric.value)
                        : undefined
                    }
                    unit={
                      metric.unit && metric.unit !== "count"
                        ? metric.unit
                        : undefined
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  {directionLabel(metric.direction)}
                </td>
                <td className="px-3 py-2">
                  {metric.aggregation ?? (
                    <span className="text-muted-foreground">
                      {NOT_RECORDED}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
