import { ChangeBadge } from "@/components/benchmarks/change-badge";
import { MetricValue } from "@/components/benchmarks/metric-value";
import {
  dimensionLabel,
  formatDelta,
  formatNumber,
  formatPercent,
  type MetricRow,
  NOT_RECORDED,
} from "../rules";

const unitOf = (unit: string) => (unit && unit !== "count" ? unit : undefined);

function Classification({ change }: Readonly<{ change: MetricRow["change"] }>) {
  if (change.kind === "compared") {
    return <ChangeBadge classification={change.classification} />;
  }
  if (change.kind === "informational") {
    return <span>Informational</span>;
  }
  return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
}

/**
 * The metrics of one comparable scenario side by side: raw values, absolute and percentage
 * delta, and a classification in words. The table scrolls inside a labelled, focusable region
 * while the metric identity stays in view.
 */
export function ComparisonTable({
  scenarioTitle,
  rows,
}: Readonly<{ scenarioTitle: string; rows: readonly MetricRow[] }>) {
  return (
    <section
      aria-label={`Comparison of ${scenarioTitle}, scrollable`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard reachable
      tabIndex={0}
      className="overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table
        aria-label={`Comparison of ${scenarioTitle}`}
        className="w-full min-w-[44rem] border-collapse text-xs"
      >
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="sticky left-0 bg-muted px-3 py-2">
              Metric
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Current
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Reference
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Change
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Change %
            </th>
            <th scope="col" className="px-3 py-2">
              Classification
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dimensions = dimensionLabel(row);
            const measured =
              row.change.kind === "not-recorded" ? null : row.change;
            return (
              <tr key={row.identity} className="border-t">
                <th
                  scope="row"
                  className="sticky left-0 bg-background px-3 py-2 text-left font-normal"
                >
                  <span className="block font-medium">{row.label}</span>
                  {dimensions ? (
                    <span className="block text-muted-foreground">
                      {dimensions}
                    </span>
                  ) : null}
                  <code className="font-mono text-muted-foreground">
                    {row.key}
                  </code>
                </th>
                <td className="px-3 py-2 text-right">
                  <MetricValue
                    value={
                      row.current === undefined
                        ? undefined
                        : formatNumber(row.current)
                    }
                    unit={unitOf(row.unit)}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <MetricValue
                    value={
                      row.reference === undefined
                        ? undefined
                        : formatNumber(row.reference)
                    }
                    unit={unitOf(row.unit)}
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {measured ? (
                    formatDelta(measured.absoluteDelta, row.unit)
                  ) : (
                    <span className="font-sans text-muted-foreground">
                      {NOT_RECORDED}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {measured ? (
                    formatPercent(measured.percentDelta)
                  ) : (
                    <span className="text-muted-foreground" title="No delta">
                      —
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Classification change={row.change} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
