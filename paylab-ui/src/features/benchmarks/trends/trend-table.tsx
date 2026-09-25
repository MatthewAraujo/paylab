import Link from "next/link";
import type { components } from "@/api/generated/schema";
import { Badge } from "@/components/ui/badge";
import {
  abbreviateCommit,
  compactIds,
  formatInstant,
  formatMetricValue,
  NOT_RECORDED,
} from "../rules";
import { buildTimeline, directionLabel, exclusionLabel } from "./model";

type Trend = components["schemas"]["TrendResponse"];

export type RunDetails = Map<
  string,
  { commit: string; note: string | undefined }
>;

/**
 * Every Run of the trend with its exact value: the complete alternative to the chart, so no
 * information depends on a pointer, on color, or on seeing the drawing.
 */
export function TrendTable({
  trend,
  details,
}: Readonly<{ trend: Trend; details: RunDetails }>) {
  const entries = buildTimeline(trend);
  const compact = compactIds(entries.map((entry) => entry.runId));
  const unit = trend.unit ?? "";
  const name = trend.label ?? trend.metricKey;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table
        className="w-full text-left text-xs"
        aria-label={`${name}${unit ? ` (${unit})` : ""}, ${directionLabel(trend.direction)}: exact values`}
      >
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Run
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Value
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Commit
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Time
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const detail = details.get(entry.runId);
            const notes: string[] = [];
            if (detail?.note) notes.push(detail.note);
            if (entry.type === "incomplete" && entry.failureSummary) {
              notes.push(entry.failureSummary);
            }
            return (
              <tr
                key={`${entry.type}-${entry.runId}`}
                className="border-b last:border-0"
              >
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/benchmarks/runs/${encodeURIComponent(entry.runId)}`}
                      title={entry.runId}
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {compact.get(entry.runId) ?? entry.runId}
                    </Link>
                    {entry.type === "point" && entry.isBaseline ? (
                      <Badge variant="new">Baseline</Badge>
                    ) : null}
                    {entry.type === "point" && entry.kind === "imported" ? (
                      <Badge variant="imported">Imported</Badge>
                    ) : null}
                    {entry.type === "incomplete" ? (
                      <Badge variant="incomplete">Incomplete Run</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 align-top font-mono">
                  {entry.type === "point"
                    ? formatMetricValue(entry.value, unit)
                    : entry.type === "incomplete"
                      ? "No value"
                      : `Left out: ${exclusionLabel(entry.reason)}`}
                </td>
                <td className="px-3 py-2 align-top font-mono">
                  {detail ? abbreviateCommit(detail.commit) : NOT_RECORDED}
                </td>
                <td className="px-3 py-2 align-top">
                  {formatInstant(entry.startedAt)}
                </td>
                <td className="px-3 py-2 align-top">
                  {notes.length > 0 ? notes.join(" · ") : NOT_RECORDED}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
