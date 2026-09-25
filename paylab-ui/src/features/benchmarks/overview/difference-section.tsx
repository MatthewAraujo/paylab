"use client";

import Link from "next/link";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { ChangeBadge } from "@/components/benchmarks/change-badge";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { buttonVariants } from "@/components/ui/button";
import type { Comparison } from "@/features/benchmarks/api/benchmark-api";
import { useRun } from "@/features/benchmarks/api/hooks";
import {
  dimensionLabel,
  formatInstant,
  formatMetricValue,
  formatPercent,
  type RunListItem,
} from "@/features/benchmarks/rules";
import { cn } from "@/lib/utils";
import {
  NOTABLE_LIMIT,
  type NotableChange,
  summarizeChanges,
} from "./notable-changes";

type DifferenceSectionProps = {
  current: RunListItem;
  reference: RunListItem;
  result: NonNullable<Comparison["comparison"]>;
};

/** What changed against the previous compatible Run, summarized and capped. */
export function DifferenceSection({
  current,
  reference,
  result,
}: Readonly<DifferenceSectionProps>) {
  const compareHref = `/benchmarks/compare?current=${encodeURIComponent(current.runId)}&reference=${encodeURIComponent(reference.runId)}`;
  const currentDetail = useRun(current.runId);
  const referenceDetail = useRun(reference.runId);
  const compatible = result.environmentCompatible && result.datasetCompatible;

  return (
    <BenchmarkSection
      title="Difference from the previous compatible Run"
      actions={
        <Link
          href={compareHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open the full comparison
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        Compared with{" "}
        <Link
          href={`/benchmarks/runs/${reference.runId}`}
          className="font-mono text-foreground underline underline-offset-4"
        >
          {reference.runId}
        </Link>
        , started{" "}
        <time dateTime={reference.startedAt}>
          {formatInstant(reference.startedAt)}
        </time>
        .
      </p>
      {!compatible ? (
        <p className="text-sm">
          The environment or the dataset differs, so measurements are not
          compared numerically.
        </p>
      ) : null}
      {currentDetail.data && referenceDetail.data ? (
        <Changes
          summary={summarizeChanges({
            states: result.scenarios,
            current: currentDetail.data,
            reference: referenceDetail.data,
          })}
        />
      ) : currentDetail.isError || referenceDetail.isError ? (
        <p className="text-sm text-muted-foreground">
          The changes could not be read. Open the full comparison instead.
        </p>
      ) : (
        <BenchmarkLoading label="Loading the changes" />
      )}
    </BenchmarkSection>
  );
}

function Changes({
  summary,
}: Readonly<{ summary: ReturnType<typeof summarizeChanges> }>) {
  const { counts, scenarios } = summary;
  const otherScenarios = [
    [scenarios.new, "new"],
    [scenarios.removed, "removed"],
    [scenarios.changed, "changed"],
    [scenarios.incompatible, "incompatible"],
  ] as const;

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>{`${counts.improved} improved`}</span>
        <span>{`${counts.stable} stable`}</span>
        <span>{`${counts.regressed} regressed`}</span>
        {counts.informational > 0 ? (
          <span>{`${counts.informational} informational`}</span>
        ) : null}
        {otherScenarios
          .filter(([count]) => count > 0)
          .map(([count, word]) => (
            <span key={word} className="text-muted-foreground">
              {`${count} ${count === 1 ? "scenario" : "scenarios"} ${word}`}
            </span>
          ))}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <NotableList
          title="Improvements"
          classification="improved"
          changes={summary.improvements}
        />
        <NotableList
          title="Regressions"
          classification="regressed"
          changes={summary.regressions}
        />
      </div>
    </div>
  );
}

function NotableList({
  title,
  classification,
  changes,
}: Readonly<{
  title: string;
  classification: "improved" | "regressed";
  changes: NotableChange[];
}>) {
  if (changes.length === 0) {
    return null;
  }
  const hidden = changes.length - NOTABLE_LIMIT;

  return (
    <div className="space-y-2">
      <ul aria-label={title} className="space-y-2">
        {changes.slice(0, NOTABLE_LIMIT).map(({ scenarioId, row }) => {
          const dimensions = dimensionLabel(row);
          const percent =
            row.change.kind === "compared" ? row.change.percentDelta : null;

          return (
            <li
              key={`${scenarioId}|${row.identity}`}
              className="rounded-md border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ChangeBadge classification={classification} />
                <span className="font-medium">{row.label}</span>
                {dimensions ? (
                  <span className="text-xs text-muted-foreground">
                    {dimensions}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs tabular-nums">
                {`${formatMetricValue(row.reference, row.unit)} → ${formatMetricValue(row.current, row.unit)} (${formatPercent(percent)})`}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {scenarioId}
              </p>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <p className="text-xs text-muted-foreground">
          {`${hidden} more ${title.toLowerCase()}`}
        </p>
      ) : null}
    </div>
  );
}
