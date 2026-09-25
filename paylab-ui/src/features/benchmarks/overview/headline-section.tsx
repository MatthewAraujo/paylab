"use client";

import { useId, useState } from "react";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { ChangeBadge } from "@/components/benchmarks/change-badge";
import { MetricValue } from "@/components/benchmarks/metric-value";
import {
  defaultHeadlineScenario,
  formatDelta,
  formatNumber,
  formatPercent,
  HEADLINE_ROLES,
  type HeadlineMetric,
  headlineByRole,
  headlineScenarios,
} from "@/features/benchmarks/rules";
import {
  compareHeadline,
  findCounterpart,
  ROLE_LABELS,
} from "./headline-compare";

type HeadlineSectionProps = {
  /** The highlights the latest Run declared. */
  metrics: readonly HeadlineMetric[];
  /** The highlights of the previous compatible Run, when there is one. */
  reference?: readonly HeadlineMetric[];
};

/**
 * Headline cards: only what the Run declared through a summary role, always with its scenario.
 * A role the Run did not declare says so instead of being guessed.
 */
export function HeadlineSection({
  metrics,
  reference,
}: Readonly<HeadlineSectionProps>) {
  const selectId = useId();
  const scenarios = headlineScenarios(metrics);
  const [picked, setPicked] = useState<string | null>(null);
  const scenarioId =
    picked && scenarios.some((entry) => entry.scenarioId === picked)
      ? picked
      : defaultHeadlineScenario(scenarios);

  if (scenarioId === null) {
    return (
      <BenchmarkSection title="Headline measurements">
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          No headline measurement declared
        </p>
      </BenchmarkSection>
    );
  }

  const declared = headlineByRole(
    scenarios.find((entry) => entry.scenarioId === scenarioId)?.metrics ?? [],
  );

  return (
    <BenchmarkSection
      title="Headline measurements"
      actions={
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={selectId} className="text-muted-foreground">
            Scenario
          </label>
          <select
            id={selectId}
            value={scenarioId}
            onChange={(event) => setPicked(event.target.value)}
            className="h-9 max-w-xs rounded-md border border-input bg-background px-2 font-mono text-xs"
          >
            {scenarios.map((entry) => (
              <option key={entry.scenarioId} value={entry.scenarioId}>
                {entry.scenarioId}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HEADLINE_ROLES.map((role) => {
          const label = ROLE_LABELS[role];
          const metric = declared[role]?.[0];

          return (
            <article
              key={role}
              aria-label={label}
              className="space-y-2 rounded-lg border p-4"
            >
              <h3 className="text-sm font-medium text-muted-foreground">
                {label}
              </h3>
              {metric ? (
                <HeadlineCard
                  metric={metric}
                  counterpart={findCounterpart(metric, reference)}
                  hasReference={reference !== undefined}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Not declared</p>
              )}
            </article>
          );
        })}
      </div>
    </BenchmarkSection>
  );
}

function HeadlineCard({
  metric,
  counterpart,
  hasReference,
}: Readonly<{
  metric: HeadlineMetric;
  counterpart: HeadlineMetric | undefined;
  hasReference: boolean;
}>) {
  const change = compareHeadline(metric, counterpart);

  return (
    <>
      <p className="text-2xl">
        <MetricValue value={formatNumber(metric.value)} unit={metric.unit} />
      </p>
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {metric.scenarioId}
      </p>
      {hasReference && change.kind === "compared" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ChangeBadge classification={change.classification} />
          <span className="font-mono tabular-nums">
            {`${formatDelta(change.absoluteDelta, metric.unit)} (${formatPercent(change.percentDelta)})`}
          </span>
        </div>
      ) : null}
    </>
  );
}
