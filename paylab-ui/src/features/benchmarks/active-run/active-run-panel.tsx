"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { RunStatusBadge } from "@/components/benchmarks/run-status-badge";
import {
  BenchmarkLoading,
  BenchmarkUnreachable,
  RefreshFailedNotice,
} from "@/components/benchmarks/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunProgress } from "../api/benchmark-api";
import { useRunProgress } from "../api/hooks";
import { PROGRESS_POLL_MS } from "../api/policy";
import { ArtifactViewerDialog } from "../artifacts/artifact-viewer-dialog";
import { formatDuration, formatInstant } from "../rules";
import { RecentLog } from "./recent-log";

export type ActiveRunPanelProps = {
  runId: string;
  /** When the Run started (ISO), to say how long it has been running. */
  startedAt: string;
  /** Polling interval; the F2 default unless a test or preview overrides it. */
  pollMs?: number;
  /** Called once when the Run leaves RUNNING (finished or abandoned), so a list can refresh. */
  onSettled?: () => void;
};

function scenarioCounts(progress: RunProgress) {
  const active = progress.scenarios.filter(
    (scenario) => scenario.status === "ACTIVE",
  ).length;
  const failed = progress.scenarios.filter(
    (scenario) => scenario.status === "FAILED",
  ).length;
  return {
    completed: progress.completed,
    active,
    failed,
    pending: Math.max(0, progress.total - progress.completed - active - failed),
  };
}

/**
 * Follows a running Run by bounded polling: status, scenario counts, the current scenario, elapsed
 * time, progress, and the tail of the active scenario's log. It says "polling" (never "live"),
 * when it last succeeded, and stops polling in every terminal or abandoned state.
 */
export function ActiveRunPanel({
  runId,
  startedAt,
  pollMs = PROGRESS_POLL_MS,
  onSettled,
}: Readonly<ActiveRunPanelProps>) {
  const progress = useRunProgress(runId, { pollMs });
  const data = progress.data;
  const stopped =
    data !== undefined && (data.status !== "RUNNING" || data.abandoned);

  const settledReported = useRef(false);
  useEffect(() => {
    if (stopped && !settledReported.current) {
      settledReported.current = true;
      onSettled?.();
    }
  }, [stopped, onSettled]);

  if (progress.isPending) {
    return <BenchmarkLoading label="Reading Run progress" />;
  }
  if (!data) {
    return <BenchmarkUnreachable onRetry={() => progress.refetch()} />;
  }

  const refreshedAt = new Date(progress.dataUpdatedAt).toISOString();
  const counts = scenarioCounts(data);
  const percent =
    data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
  const current = data.scenarios.find(({ id }) => id === data.current);

  return (
    <BenchmarkSection title="Active Run">
      <div className="space-y-4 rounded-lg border p-5">
        <p
          role="status"
          aria-live="polite"
          aria-label="Run announcements"
          className="sr-only"
        >
          {data.abandoned
            ? "Run abandoned"
            : data.status !== "RUNNING"
              ? `Run ${data.status.toLowerCase()}`
              : data.current
                ? `Now running ${data.current}`
                : ""}
        </p>

        {progress.isRefetchError ? (
          <RefreshFailedNotice lastUpdated={formatInstant(refreshedAt)} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={data.status} />
          <span className="text-sm text-muted-foreground">
            Elapsed{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(progress.dataUpdatedAt - Date.parse(startedAt))}
            </span>
          </span>
        </div>

        {data.abandoned ? (
          <p className="text-sm">
            The process that was running this Run is gone, so it will not
            progress any further. Polling stopped. Its record stays as it was
            last written.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <progress
                aria-label="Run progress"
                value={data.completed}
                max={Math.max(data.total, 1)}
                className="h-2 w-full"
              />
              <p className="text-sm">
                {`${data.completed} of ${data.total} scenarios (${percent}%)`}
              </p>
            </div>

            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>{`${counts.completed} completed`}</span>
              <span>{`${counts.active} active`}</span>
              <span>{`${counts.pending} pending`}</span>
              <span>{`${counts.failed} failed`}</span>
            </p>

            {data.current ? (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">
                  Current scenario
                </p>
                <p className="break-all font-mono">{data.current}</p>
                {current ? (
                  <p className="text-xs text-muted-foreground">
                    {current.title}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {stopped ? "Polling stopped. " : `Polling every ${pollMs / 1000} s. `}
          <span>
            Last successful refresh{" "}
            <time dateTime={refreshedAt}>{formatInstant(refreshedAt)}</time>
          </span>
        </p>

        {!stopped && data.current ? (
          <div className="space-y-2">
            <RecentLog
              runId={runId}
              scenarioId={data.current}
              refreshedAt={progress.dataUpdatedAt}
            />
            <ArtifactViewerDialog
              runId={runId}
              artifactId={`${data.current}-log`}
              label={`${data.current} log`}
            >
              Open full log
            </ArtifactViewerDialog>
          </div>
        ) : null}

        <Link
          href={`/benchmarks/runs/${runId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open Run detail
        </Link>
      </div>
    </BenchmarkSection>
  );
}
