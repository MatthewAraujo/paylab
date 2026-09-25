"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useBaseline } from "../api/hooks";
import { BaselineAction } from "../baseline/baseline-action";

/**
 * Entry points from a completed Run to its comparisons, and the Baseline action slot. Only a
 * completed Run is offered here: an Incomplete or running one can be neither compared nor
 * selected, so the caller does not render this for it.
 */
export function RunShortcuts({
  runId,
  baseUrl,
  baselineAction,
  baselineWrite = true,
}: Readonly<{
  runId: string;
  baseUrl?: string;
  /** Replaces the Baseline selection, for callers that render their own. */
  baselineAction?: ReactNode;
  /** False when the API contract has no Baseline write. */
  baselineWrite?: boolean;
}>) {
  const baseline = useBaseline({ baseUrl });
  const current = encodeURIComponent(runId);
  const baselineRunId = baseline.data?.baseline?.runId;

  let baselineEntry: ReactNode;
  if (baseline.isPending) {
    baselineEntry = (
      <span className="text-muted-foreground">Reading the Baseline…</span>
    );
  } else if (baseline.isError) {
    baselineEntry = (
      <span className="text-muted-foreground">
        The Baseline could not be read.
      </span>
    );
  } else if (!baselineRunId) {
    baselineEntry = (
      <span className="text-muted-foreground">No Baseline selected</span>
    );
  } else if (baselineRunId === runId) {
    baselineEntry = <span>This Run is the Baseline</span>;
  } else {
    baselineEntry = (
      <Link
        className="underline underline-offset-4"
        href={`/benchmarks/compare?current=${current}&reference=${encodeURIComponent(baselineRunId)}`}
      >
        Compare with the Baseline
      </Link>
    );
  }

  return (
    <section aria-labelledby="shortcuts-heading" className="space-y-3">
      <h2 id="shortcuts-heading" className="text-base font-semibold">
        Comparison and Baseline
      </h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link
            className="underline underline-offset-4"
            href={`/benchmarks/compare?current=${current}`}
          >
            Compare with the previous compatible Run
          </Link>
        </li>
        <li>{baselineEntry}</li>
      </ul>
      {baselineAction ?? (
        <BaselineAction
          runId={runId}
          status="COMPLETED"
          enabled={baselineWrite}
          baseUrl={baseUrl}
        />
      )}
    </section>
  );
}
