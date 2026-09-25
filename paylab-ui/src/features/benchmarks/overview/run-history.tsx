"use client";

import Link from "next/link";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { ProvenanceBadge } from "@/components/benchmarks/provenance-badge";
import { RunStatusBadge } from "@/components/benchmarks/run-status-badge";
import { Button } from "@/components/ui/button";
import {
  abbreviateCommit,
  defaultHeadlineScenario,
  formatInstant,
  formatMetricValue,
  HEADLINE_ROLES,
  headlineByRole,
  headlineScenarios,
  type RunListItem,
} from "@/features/benchmarks/rules";

/** The first declared highlight of the scenario the Run features by default, as text. */
function headlineText(run: RunListItem): string {
  const scenarios = headlineScenarios(run.headlineMetrics);
  const featured = scenarios.find(
    ({ scenarioId }) => scenarioId === defaultHeadlineScenario(scenarios),
  );
  const declared = headlineByRole(featured?.metrics ?? []);
  const metric = HEADLINE_ROLES.map((role) => declared[role]?.[0]).find(
    Boolean,
  );
  return metric
    ? formatMetricValue(metric.value, metric.unit)
    : "No headline declared";
}

type RunHistoryProps = {
  runs: readonly RunListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

/** Every Run read so far, newest first, with more available through the API's cursor. */
export function RunHistory({
  runs,
  hasMore,
  loadingMore,
  onLoadMore,
}: Readonly<RunHistoryProps>) {
  return (
    <BenchmarkSection title="Recent Runs">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Run
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Started
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Source
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Headline
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/benchmarks/runs/${run.runId}`}
                    className="font-mono text-xs underline underline-offset-4"
                  >
                    {run.runId}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <RunStatusBadge status={run.status} />
                    {run.kind === "imported" ? (
                      <ProvenanceBadge kind="imported" />
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <time dateTime={run.startedAt}>
                    {formatInstant(run.startedAt)}
                  </time>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">
                    {run.source.branch}
                    {run.source.commit === "unknown"
                      ? ""
                      : ` @ ${abbreviateCommit(run.source.commit)}`}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums">
                  {headlineText(run)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          Load more Runs
        </Button>
      ) : null}
    </BenchmarkSection>
  );
}
