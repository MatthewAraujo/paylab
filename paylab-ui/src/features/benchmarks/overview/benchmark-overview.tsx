"use client";

import {
  BenchmarkEmpty,
  BenchmarkLoading,
  BenchmarkUnavailable,
  BenchmarkUnreachable,
  RefreshFailedNotice,
  SkippedRecordsNotice,
} from "@/components/benchmarks/states";
import { ActiveRunPanel } from "../active-run/active-run-panel";
import { useDefaultComparison, useRun, useRuns } from "../api/hooks";
import { BenchmarkRequestError } from "../api/results";
import { formatInstant, type RunListItem } from "../rules";
import { BaselineSection } from "./baseline-section";
import { DifferenceSection } from "./difference-section";
import { HeadlineSection } from "./headline-section";
import { LatestRun } from "./latest-run";
import { RunHistory } from "./run-history";
import { ScenarioGroups } from "./scenario-groups";

const HISTORY_PAGE_SIZE = 10;

/** The Benchmarks overview: the newest Run, what it measured, and how it compares. */
export function BenchmarkOverview() {
  const runs = useRuns({ limit: HISTORY_PAGE_SIZE });

  if (runs.isPending) {
    return <BenchmarkLoading label="Loading Benchmark Runs" />;
  }
  if (runs.isError && !runs.data) {
    return runs.error instanceof BenchmarkRequestError &&
      runs.error.failure.kind === "unavailable" ? (
      <BenchmarkUnavailable />
    ) : (
      <BenchmarkUnreachable onRetry={() => runs.refetch()} />
    );
  }

  const items = runs.data.pages.flatMap((page) => page.items);
  const skipped = runs.data.pages.reduce(
    (total, page) => total + page.skipped.length,
    0,
  );

  return (
    <div className="space-y-8">
      {runs.isRefetchError ? (
        <RefreshFailedNotice
          lastUpdated={formatInstant(
            new Date(runs.dataUpdatedAt).toISOString(),
          )}
        />
      ) : null}
      <SkippedRecordsNotice count={skipped} />
      {items.length === 0 ? (
        <BenchmarkEmpty />
      ) : (
        <>
          <LatestSection
            latest={items[0]}
            onActiveRunSettled={() => {
              void runs.refetch();
            }}
          />
          <RunHistory
            runs={items}
            hasMore={runs.hasNextPage}
            loadingMore={runs.isFetchingNextPage}
            onLoadMore={() => runs.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}

/** Everything about the newest Run; what is shown depends on how that Run ended. */
function LatestSection({
  latest,
  onActiveRunSettled,
}: Readonly<{ latest: RunListItem; onActiveRunSettled: () => void }>) {
  const settled = latest.status === "COMPLETED";
  const imported = useRun(latest.runId);

  return (
    <>
      <LatestRun
        run={latest}
        importedSource={imported.data?.imported?.source}
      />
      {latest.status === "RUNNING" ? (
        <ActiveRunPanel
          runId={latest.runId}
          startedAt={latest.startedAt}
          onSettled={onActiveRunSettled}
        />
      ) : null}
      {settled ? <SettledSections latest={latest} /> : null}
      {latest.status === "RUNNING" ? null : (
        <ScenarioGroups runId={latest.runId} />
      )}
    </>
  );
}

/** Headline, difference and Baseline: only a completed Run has measurements worth classifying. */
function SettledSections({ latest }: Readonly<{ latest: RunListItem }>) {
  const defaultComparison = useDefaultComparison();
  // The default comparison always starts from the newest completed Run, which is the latest one
  // here; if the API answers for another Run there is nothing to say about this one.
  const data = defaultComparison.data;
  const comparison =
    data?.current?.runId === latest.runId && data.reference && data.comparison
      ? {
          current: data.current,
          reference: data.reference,
          result: data.comparison,
        }
      : undefined;

  return (
    <>
      <HeadlineSection
        metrics={latest.headlineMetrics}
        reference={comparison?.reference.headlineMetrics}
      />
      {comparison ? (
        <DifferenceSection {...comparison} />
      ) : defaultComparison.isPending ? null : (
        <p className="text-sm text-muted-foreground">
          No previous compatible Run to compare with.
        </p>
      )}
      <BaselineSection latest={latest} />
    </>
  );
}
