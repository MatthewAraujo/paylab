"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useBaseline } from "../api/hooks";

/**
 * Shown in place of a Baseline action until the selection is wired: present, plainly disabled,
 * and behaving like nothing.
 */
export function DisabledBaselineAction() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      title="Baseline selection is not available in this build yet"
    >
      Make this Run the Baseline
    </Button>
  );
}

/**
 * Entry points from a completed Run to its comparisons, and the Baseline action slot. Only a
 * completed Run is offered here: an Incomplete or running one can be neither compared nor
 * selected, so the caller does not render this for it.
 */
export function RunShortcuts({
  runId,
  baseUrl,
  baselineAction,
}: Readonly<{
  runId: string;
  baseUrl?: string;
  baselineAction?: ReactNode;
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
      {baselineRunId === runId
        ? null
        : (baselineAction ?? <DisabledBaselineAction />)}
    </section>
  );
}
