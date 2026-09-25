"use client";

import Link from "next/link";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { ChangeBadge } from "@/components/benchmarks/change-badge";
import { MetricValue } from "@/components/benchmarks/metric-value";
import { useBaseline } from "@/features/benchmarks/api/hooks";
import { BaselineGitNotice } from "@/features/benchmarks/baseline/baseline-git-notice";
import {
  defaultHeadlineScenario,
  formatNumber,
  HEADLINE_ROLES,
  headlineByRole,
  headlineScenarios,
  type RunListItem,
} from "@/features/benchmarks/rules";
import { compareHeadline, findCounterpart } from "./headline-compare";

/**
 * A compact reference to the Baseline: which Run it is and how the latest Run's default headline
 * stands against it. Read from the light Run item, so no full record is fetched for it.
 */
export function BaselineSection({ latest }: Readonly<{ latest: RunListItem }>) {
  const baseline = useBaseline();

  return (
    <BenchmarkSection title="Baseline">
      {baseline.isPending ? (
        <p className="text-sm text-muted-foreground">Reading the Baseline…</p>
      ) : baseline.isError ? (
        <p className="text-sm text-muted-foreground">
          The Baseline could not be read.
        </p>
      ) : baseline.data.run === null ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>No Baseline selected</p>
          {baseline.data.problem ? <p>{baseline.data.problem}</p> : null}
        </div>
      ) : (
        <BaselineIndication latest={latest} run={baseline.data.run} />
      )}
      {baseline.data ? (
        <div className="mt-3">
          <BaselineGitNotice git={baseline.data.git} />
        </div>
      ) : null}
    </BenchmarkSection>
  );
}

function BaselineIndication({
  latest,
  run,
}: Readonly<{ latest: RunListItem; run: RunListItem }>) {
  if (run.runId === latest.runId) {
    return <p className="text-sm">The latest Run is the Baseline.</p>;
  }

  const scenarios = headlineScenarios(latest.headlineMetrics);
  const featured = scenarios.find(
    ({ scenarioId }) => scenarioId === defaultHeadlineScenario(scenarios),
  );
  const declared = headlineByRole(featured?.metrics ?? []);
  const metric = HEADLINE_ROLES.map((role) => declared[role]?.[0]).find(
    Boolean,
  );
  const counterpart = metric
    ? findCounterpart(metric, run.headlineMetrics)
    : undefined;
  const change = metric ? compareHeadline(metric, counterpart) : undefined;

  return (
    <div className="space-y-2 text-sm">
      <p>
        Baseline Run{" "}
        <Link
          href={`/benchmarks/runs/${run.runId}`}
          className="font-mono underline underline-offset-4"
        >
          {run.runId}
        </Link>
      </p>
      {metric ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{metric.label}</span>
          <MetricValue
            value={counterpart ? formatNumber(counterpart.value) : null}
            unit={counterpart ? counterpart.unit : undefined}
          />
          {change?.kind === "compared" ? (
            <ChangeBadge classification={change.classification} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
