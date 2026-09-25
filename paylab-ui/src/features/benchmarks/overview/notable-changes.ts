import type {
  Comparison,
  RunDetail,
} from "@/features/benchmarks/api/benchmark-api";
import {
  compareScenario,
  type MetricCounts,
  type MetricRow,
  summarizeComparison,
} from "@/features/benchmarks/rules";

/** How many improvements and how many regressions the overview lists; the rest is one click away. */
export const NOTABLE_LIMIT = 5;

export type NotableChange = { scenarioId: string; row: MetricRow };

export type ChangeSummary = {
  counts: MetricCounts;
  scenarios: ReturnType<typeof summarizeComparison>["scenarios"];
  /** Largest change first. Only comparable scenarios contribute, and only beyond the 5% band. */
  improvements: NotableChange[];
  regressions: NotableChange[];
};

// A move away from zero has no percentage; it is at least as notable as any percentage.
const magnitude = ({ row }: NotableChange) =>
  row.change.kind === "compared"
    ? Math.abs(row.change.percentDelta ?? Number.POSITIVE_INFINITY)
    : 0;

const byMagnitude = (a: NotableChange, b: NotableChange) =>
  magnitude(b) - magnitude(a);

/** What changed between two Runs, from the API's scenario states and the two full records. */
export function summarizeChanges(input: {
  states: NonNullable<Comparison["comparison"]>["scenarios"];
  current: RunDetail;
  reference: RunDetail;
}): ChangeSummary {
  const comparisons = input.states.map(({ scenarioId, state }) =>
    compareScenario({
      scenarioId,
      state,
      current: input.current.scenarios.find(({ id }) => id === scenarioId),
      reference: input.reference.scenarios.find(({ id }) => id === scenarioId),
    }),
  );

  const improvements: NotableChange[] = [];
  const regressions: NotableChange[] = [];
  for (const { scenarioId, rows } of comparisons) {
    for (const row of rows) {
      if (row.change.kind !== "compared") continue;
      if (row.change.classification === "improved") {
        improvements.push({ scenarioId, row });
      } else if (row.change.classification === "regressed") {
        regressions.push({ scenarioId, row });
      }
    }
  }

  const summary = summarizeComparison(comparisons);
  return {
    counts: summary.metrics,
    scenarios: summary.scenarios,
    improvements: improvements.sort(byMagnitude),
    regressions: regressions.sort(byMagnitude),
  };
}
