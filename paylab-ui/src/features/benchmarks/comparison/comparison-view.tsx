"use client";

import { BenchmarkFailureState } from "@/components/benchmarks/benchmark-failure-state";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { BenchmarkRequestError } from "../api/results";
import { ComparisonBody } from "./comparison-body";
import { RunSelectors } from "./run-selectors";
import { useComparisonData } from "./use-comparison-data";

export type ComparisonViewProps = {
  /** From the query string. */
  current?: string;
  reference?: string;
  baseUrl?: string;
};

/**
 * Two completed Runs compared: selectors backed by the address, then compatibility, summary
 * and scenarios. The Baseline action is not offered here; choosing the Baseline as the
 * reference only reads it.
 */
export function ComparisonView({
  current,
  reference,
  baseUrl,
}: Readonly<ComparisonViewProps>) {
  const { mode, query } = useComparisonData({ current, reference, baseUrl });
  const data = query.data;
  const error = query.error;
  const failure =
    error instanceof BenchmarkRequestError
      ? error.failure
      : error
        ? ({ kind: "unreachable", message: String(error) } as const)
        : undefined;
  const selectable =
    !failure || failure.kind === "refused" || failure.kind === "not-found";

  return (
    <div>
      {selectable ? (
        <RunSelectors
          current={data?.current?.runId ?? current}
          reference={data?.reference?.runId ?? reference}
          baseUrl={baseUrl}
        />
      ) : null}
      {query.isPending ? (
        <BenchmarkLoading label="Loading the comparison" />
      ) : failure && !data ? (
        <BenchmarkFailureState
          failure={failure}
          subject="Benchmark Run"
          subjectId={current}
          onRetry={() => void query.refetch()}
        />
      ) : data?.comparison && data.reference ? (
        <ComparisonBody comparison={data} baseUrl={baseUrl} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No reference Run to compare with.{" "}
          {mode === "previous"
            ? "No earlier completed Run has a scenario that can be compared with this one."
            : "A comparison needs at least two completed Runs."}{" "}
          Choose a reference Run above.
        </p>
      )}
    </div>
  );
}
