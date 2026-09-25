"use client";

import { AlertTriangle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  BenchmarkEmpty,
  BenchmarkLoading,
  BenchmarkUnavailable,
  BenchmarkUnreachable,
} from "@/components/benchmarks/states";
import { useRun, useRuns, useTrend } from "../api/hooks";
import { BenchmarkRequestError } from "../api/results";
import { directionLabel } from "./model";
import {
  type Dimensions,
  dimensionLabel,
  dimensionsOf,
  metricsOf,
  parseSelection,
  resolveSelection,
  selectionToQuery,
  type TrendSelection,
} from "./selection";
import { TrendChart } from "./trend-chart";
import { type RunDetails, TrendTable } from "./trend-table";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const encodeDimensions = (dimensions: Dimensions) =>
  Object.entries(dimensions)
    .map(([key, value]) => `${key}:${value}`)
    .join("|");

function Problem({ children }: Readonly<{ children: string }>) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}

function failureView(error: unknown, retry: () => void) {
  const failure =
    error instanceof BenchmarkRequestError ? error.failure : undefined;
  switch (failure?.kind) {
    case "unavailable":
      return <BenchmarkUnavailable />;
    case "refused":
    case "not-found":
      return <Problem>{failure.message}</Problem>;
    default:
      return <BenchmarkUnreachable onRetry={retry} />;
  }
}

/**
 * The Historical trends view: pick a scenario, metric and dimension (kept in the address) and
 * read that metric across the compatible completed Runs.
 */
export function TrendsView({ baseUrl }: Readonly<{ baseUrl?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runs = useRuns({}, { baseUrl });

  // The history is small and local: read every page so commits and notes can be joined.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = runs;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(
    () => runs.data?.pages.flatMap((page) => page.items) ?? [],
    [runs.data],
  );
  const latest = items.find((item) => item.status === "COMPLETED");
  const detail = useRun(latest?.runId ?? "", { baseUrl });
  const scenarios = detail.data?.scenarios ?? [];
  const selection = resolveSelection(
    parseSelection(new URLSearchParams(searchParams.toString())),
    scenarios,
  );
  const ready = Boolean(selection.scenarioId && selection.metric);
  const trend = useTrend(
    {
      scenarioId: selection.scenarioId ?? "",
      metric: selection.metric ?? "",
      dimensions: selection.dimensions,
    },
    { baseUrl, enabled: ready },
  );

  const details: RunDetails = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.runId,
          { commit: item.source.commit, note: item.note },
        ]),
      ),
    [items],
  );

  if (runs.isPending) {
    return <BenchmarkLoading label="Loading Benchmark Runs" />;
  }
  if (runs.isError) {
    return failureView(runs.error, () => runs.refetch());
  }
  if (!latest) {
    return (
      <BenchmarkEmpty
        title="No completed Benchmark Run yet"
        description="A trend needs at least one completed Run. Start one from the terminal with pnpm benchmark:run in paylab-api."
      />
    );
  }
  if (detail.isPending) {
    return <BenchmarkLoading label="Loading scenarios" />;
  }
  if (detail.isError) {
    return failureView(detail.error, () => detail.refetch());
  }

  const go = (next: TrendSelection) =>
    router.replace(`${pathname}?${selectionToQuery(next)}`);

  const scenarioOptions = scenarios.map((s) => ({ id: s.id, title: s.title }));
  if (
    selection.scenarioId &&
    !scenarioOptions.some((option) => option.id === selection.scenarioId)
  ) {
    scenarioOptions.push({
      id: selection.scenarioId,
      title: `${selection.scenarioId} (not in the newest completed Run)`,
    });
  }
  const metricOptions = metricsOf(scenarios, selection.scenarioId).map(
    (option) => ({ key: option.key, label: option.label }),
  );
  if (
    selection.metric &&
    !metricOptions.some((option) => option.key === selection.metric)
  ) {
    metricOptions.push({ key: selection.metric, label: selection.metric });
  }
  const variants = dimensionsOf(
    scenarios,
    selection.scenarioId,
    selection.metric,
  );

  const changeScenario = (scenarioId: string) => {
    const metric = metricsOf(scenarios, scenarioId)[0]?.key;
    go({
      scenarioId,
      metric,
      dimensions: dimensionsOf(scenarios, scenarioId, metric)[0] ?? {},
    });
  };
  const changeMetric = (metric: string) =>
    go({
      scenarioId: selection.scenarioId,
      metric,
      dimensions:
        dimensionsOf(scenarios, selection.scenarioId, metric)[0] ?? {},
    });
  const changeDimension = (encoded: string) =>
    go({
      ...selection,
      dimensions:
        variants.find((v) => encodeDimensions(v) === encoded) ??
        selection.dimensions,
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4 text-xs">
        <label className="flex flex-col gap-1">
          Scenario
          <select
            className={selectClass}
            value={selection.scenarioId ?? ""}
            onChange={(event) => changeScenario(event.target.value)}
          >
            {scenarioOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Metric
          <select
            className={selectClass}
            value={selection.metric ?? ""}
            onChange={(event) => changeMetric(event.target.value)}
          >
            {metricOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {variants.length > 0 ? (
          <label className="flex flex-col gap-1">
            Dimension
            <select
              className={selectClass}
              value={encodeDimensions(selection.dimensions)}
              onChange={(event) => changeDimension(event.target.value)}
            >
              {variants.map((variant) => (
                <option
                  key={encodeDimensions(variant)}
                  value={encodeDimensions(variant)}
                >
                  {dimensionLabel(variant)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {trend.isPending ? (
        <BenchmarkLoading label="Loading trend" />
      ) : trend.isError ? (
        failureView(trend.error, () => trend.refetch())
      ) : (
        <TrendBody trend={trend.data} details={details} />
      )}
    </div>
  );
}

function TrendBody({
  trend,
  details,
}: Readonly<{
  trend: NonNullable<ReturnType<typeof useTrend>["data"]>;
  details: RunDetails;
}>) {
  const hasEntries =
    trend.points.length + trend.excluded.length + trend.incompleteRuns.length >
    0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {trend.label ?? trend.metricKey}
        {trend.unit ? `, in ${trend.unit}` : ""}.{" "}
        {directionLabel(trend.direction)}.
      </p>

      {trend.points.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No compatible history for this metric yet: no completed Run has a
          value that can be compared with the newest definition.
        </p>
      ) : (
        <>
          {trend.points.length === 1 ? (
            <p className="text-xs text-muted-foreground">
              Only one compatible Run has this metric, so there is no line yet.
            </p>
          ) : null}
          <TrendChart trend={trend} />
        </>
      )}

      {hasEntries ? <TrendTable trend={trend} details={details} /> : null}
    </div>
  );
}
