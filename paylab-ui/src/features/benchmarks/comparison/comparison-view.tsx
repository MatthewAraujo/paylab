"use client";

import { BenchmarkFailureState } from "@/components/benchmarks/benchmark-failure-state";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { BenchmarkRequestError } from "../api/results";
import { BaselineAction } from "../baseline/baseline-action";
import { ComparisonBody } from "./comparison-body";
import { RunSelectors } from "./run-selectors";
import { useComparisonData } from "./use-comparison-data";

export type ComparisonViewProps = {
  /** From the query string. */
  current?: string;
  reference?: string;
  baseUrl?: string;
  /** False when the API contract has no Baseline write. */
  baselineWrite?: boolean;
};

/**
 * Two completed Runs compared: selectors backed by the address, then compatibility, summary
 * and scenarios. Either compared Run can be made the Baseline; choosing the Baseline as the
 * reference only reads it.
 */
export function ComparisonView({
  current,
  reference,
  baseUrl,
  baselineWrite,
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
      {data?.comparison && data.current && data.reference ? (
        <div className="mb-6 flex flex-wrap gap-3">
          <BaselineAction
            runId={data.current.runId}
            status={data.current.status}
            label="Make the current Run the Baseline"
            enabled={baselineWrite}
            baseUrl={baseUrl}
          />
          <BaselineAction
            runId={data.reference.runId}
            status={data.reference.status}
            label="Make the reference Run the Baseline"
            enabled={baselineWrite}
            baseUrl={baseUrl}
          />
        </div>
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
