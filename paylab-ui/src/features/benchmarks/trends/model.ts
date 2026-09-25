import type { components } from "@/api/generated/schema";

type Trend = components["schemas"]["TrendResponse"];
type Exclusion = components["schemas"]["TrendExclusionResponse"];

export type TrendEntry =
  | {
      type: "point";
      runId: string;
      startedAt: string;
      kind: "native" | "imported";
      value: number;
      isBaseline: boolean;
    }
  | {
      type: "incomplete";
      runId: string;
      startedAt: string;
      failureSummary?: string;
      isBaseline: false;
    }
  | {
      type: "excluded";
      runId: string;
      startedAt: string;
      reason: Exclusion["reason"];
      isBaseline: false;
    };

const RANK = { point: 0, incomplete: 1, excluded: 2 } as const;

/**
 * Every Run the trend knows about in Run order. Position is the order of the Runs, not a date
 * scale: imported Runs can share a recorded date. Ties keep values first.
 */
export function buildTimeline(trend: Trend): TrendEntry[] {
  const entries: TrendEntry[] = [
    ...trend.points.map(
      (point): TrendEntry => ({
        type: "point",
        runId: point.runId,
        startedAt: point.startedAt,
        kind: point.kind,
        value: point.value,
        isBaseline: point.runId === trend.baselineRunId,
      }),
    ),
    ...trend.incompleteRuns.map(
      (run): TrendEntry => ({
        type: "incomplete",
        runId: run.runId,
        startedAt: run.startedAt,
        failureSummary: run.failureSummary,
        isBaseline: false,
      }),
    ),
    ...trend.excluded.map(
      (run): TrendEntry => ({
        type: "excluded",
        runId: run.runId,
        startedAt: run.startedAt,
        reason: run.reason,
        isBaseline: false,
      }),
    ),
  ];

  return entries
    .map((entry, order) => ({ entry, order }))
    .sort(
      (a, b) =>
        Date.parse(a.entry.startedAt) - Date.parse(b.entry.startedAt) ||
        RANK[a.entry.type] - RANK[b.entry.type] ||
        a.order - b.order,
    )
    .map(({ entry }) => entry);
}

/**
 * Groups of timeline indexes of consecutive points. An exclusion ends a group, so the line is
 * never drawn across a Run left out for a change; an Incomplete Run carries no value and no
 * change, so it does not.
 */
export function lineSegments(entries: readonly TrendEntry[]): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];

  for (const [index, entry] of entries.entries()) {
    if (entry.type === "point") {
      current.push(index);
    } else if (entry.type === "excluded" && current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

/** The vertical range that fits the values with a little room; a flat series still has height. */
export function valueExtent(values: readonly number[]): {
  min: number;
  max: number;
} {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const pad = span > 0 ? span * 0.1 : Math.abs(low) * 0.1 || 1;
  return { min: low - pad, max: high + pad };
}

export function directionLabel(direction: Trend["direction"]): string {
  switch (direction) {
    case "HIGHER_IS_BETTER":
      return "Higher is better";
    case "LOWER_IS_BETTER":
      return "Lower is better";
    case "NEUTRAL":
      return "Neither direction is better";
    default:
      return "Direction not recorded";
  }
}

export function exclusionLabel(reason: Exclusion["reason"]): string {
  switch (reason) {
    case "changed":
      return "Scenario definition changed";
    case "environment-incompatible":
      return "Different environment";
    case "dataset-incompatible":
      return "Different dataset";
    case "metric-not-recorded":
      return "Metric not recorded";
  }
}
