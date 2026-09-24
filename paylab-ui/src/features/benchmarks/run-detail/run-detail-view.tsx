"use client";

import type { ReactNode } from "react";
import { BenchmarkFailureState } from "@/components/benchmarks/benchmark-failure-state";
import {
  BenchmarkLoading,
  RefreshFailedNotice,
} from "@/components/benchmarks/states";
import { useRun } from "../api/hooks";
import { BenchmarkRequestError } from "../api/results";
import { formatInstant } from "../rules";
import { ArtifactInventory } from "./artifact-inventory";
import { DiagnosticMeasurements, FailureEvidence } from "./failure-evidence";
import { RunIdentity } from "./run-identity";
import { RunShortcuts } from "./run-shortcuts";
import { ScenarioGroups } from "./scenario-groups";
import type { Artifact, RunDetail } from "./types";

export type RunDetailViewProps = {
  runId: string;
  baseUrl?: string;
  /**
   * The Baseline action for a completed Run, wired by the Baseline task. Absent, a disabled
   * placeholder stands in; an Incomplete or running Run never shows one.
   */
  baselineAction?: ReactNode;
  /** One action per Artifact row (the viewer), wired by the Artifact task. */
  renderArtifactAction?: (artifact: Artifact) => ReactNode;
};

function Scenarios({ run }: Readonly<{ run: RunDetail }>) {
  return (
    <section aria-labelledby="scenarios-heading" className="space-y-3">
      <h2 id="scenarios-heading" className="text-base font-semibold">
        Scenarios
      </h2>
      {run.status === "RUNNING" ? (
        <p className="text-xs text-muted-foreground">
          This Run is still running; scenarios that have not finished have no
          measurements yet.
        </p>
      ) : null}
      {run.scenarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No scenario has been recorded yet.
        </p>
      ) : (
        <ScenarioGroups scenarios={run.scenarios} />
      )}
    </section>
  );
}

function Artifacts({
  run,
  renderAction,
}: Readonly<{
  run: RunDetail;
  renderAction?: (artifact: Artifact) => ReactNode;
}>) {
  return (
    <section aria-labelledby="artifacts-heading" className="space-y-3">
      <h2 id="artifacts-heading" className="text-base font-semibold">
        Artifacts
      </h2>
      <ArtifactInventory
        artifacts={run.artifacts}
        renderAction={renderAction}
      />
    </section>
  );
}

/**
 * Every persisted state of one Run and all its normalized evidence. An Incomplete Run reads
 * failure first, then its diagnostic measurements, then its Artifacts; a completed one reads
 * identity, scenarios, Artifacts and its comparison entries.
 */
export function RunDetailView({
  runId,
  baseUrl,
  baselineAction,
  renderArtifactAction,
}: Readonly<RunDetailViewProps>) {
  const query = useRun(runId, { baseUrl });

  if (query.isPending) {
    return <BenchmarkLoading label="Loading Benchmark Run" />;
  }
  if (!query.data) {
    const error = query.error;
    return (
      <BenchmarkFailureState
        failure={
          error instanceof BenchmarkRequestError
            ? error.failure
            : { kind: "unreachable", message: String(error) }
        }
        subject="Benchmark Run"
        subjectId={runId}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const run = query.data;

  return (
    <div className="space-y-8">
      {query.isRefetchError ? (
        <RefreshFailedNotice
          lastUpdated={formatInstant(
            new Date(query.dataUpdatedAt).toISOString(),
          )}
        />
      ) : null}
      <RunIdentity run={run} />
      {run.status === "INCOMPLETE" ? (
        <>
          {run.failure ? (
            <FailureEvidence failure={run.failure} scenarios={run.scenarios} />
          ) : null}
          <DiagnosticMeasurements scenarios={run.scenarios} />
          <Artifacts run={run} renderAction={renderArtifactAction} />
        </>
      ) : (
        <>
          <Scenarios run={run} />
          <Artifacts run={run} renderAction={renderArtifactAction} />
          {run.status === "COMPLETED" ? (
            <RunShortcuts
              runId={run.runId}
              baseUrl={baseUrl}
              baselineAction={baselineAction}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
