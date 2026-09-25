"use client";

import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { useRun } from "@/features/benchmarks/api/hooks";
import { groupScenarios, type StatusCounts } from "@/features/benchmarks/rules";

function countsText(counts: StatusCounts): string {
  const parts = [`${counts.completed} of ${counts.total} completed`];
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.active > 0) parts.push(`${counts.active} active`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  return parts.join(", ");
}

/** The latest Run's scenarios grouped as the Run declares them, with status counts. */
export function ScenarioGroups({ runId }: Readonly<{ runId: string }>) {
  const run = useRun(runId);

  return (
    <BenchmarkSection title="Scenario groups">
      {run.data ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {groupScenarios(run.data.scenarios).map((group) => (
            <li
              key={group.group}
              aria-label={group.title}
              className="rounded-lg border p-4"
            >
              <p className="font-medium">{group.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {countsText(group.counts)}
              </p>
            </li>
          ))}
        </ul>
      ) : run.isError ? (
        <p className="text-sm text-muted-foreground">
          The scenarios of this Run could not be read.
        </p>
      ) : (
        <BenchmarkLoading label="Loading scenario groups" />
      )}
    </BenchmarkSection>
  );
}
