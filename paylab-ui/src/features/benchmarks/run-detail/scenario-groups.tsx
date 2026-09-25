"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { groupScenarios, type Scenario } from "../rules";
import { MetricTable } from "./metric-table";
import { formatProtocol } from "./protocol";

/**
 * A Run with more measurements than this opens with every group and scenario collapsed, and a
 * table is not mounted until its scenario is opened. A full concurrency Run has about 1,900.
 */
export const EXPAND_ALL_UP_TO_METRICS = 100;

const STATUS_LABELS: Record<Scenario["status"], string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function Disclosure({
  open,
  onToggle,
  controls,
  level,
  children,
}: Readonly<{
  open: boolean;
  onToggle: () => void;
  controls: string;
  level: 3 | 4;
  children: ReactNode;
}>) {
  const Heading = level === 3 ? "h3" : "h4";
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <Heading className="text-sm font-semibold">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">{children}</span>
      </button>
    </Heading>
  );
}

function ScenarioBlock({
  scenario,
  defaultOpen,
}: Readonly<{ scenario: Scenario; defaultOpen: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const config = Object.entries(scenario.config)
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join(", ");

  return (
    <li className="rounded-md border">
      <Disclosure
        open={open}
        onToggle={() => setOpen((current) => !current)}
        controls={bodyId}
        level={4}
      >
        <span>{scenario.title}</span>
        <code className="font-mono text-xs font-normal text-muted-foreground">
          {scenario.id}
        </code>
        <span className="text-xs font-normal text-muted-foreground">
          {formatProtocol(scenario.protocol)}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {STATUS_LABELS[scenario.status]} · {scenario.metrics.length}{" "}
          {scenario.metrics.length === 1 ? "metric" : "metrics"}
        </span>
      </Disclosure>
      <div id={bodyId} hidden={!open} className="space-y-2 px-3 pb-3">
        {open ? (
          <>
            {config ? (
              <p className="text-xs text-muted-foreground">
                Configuration: {config}
              </p>
            ) : null}
            <MetricTable
              scenarioTitle={scenario.title}
              metrics={scenario.metrics}
            />
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Scenarios grouped by their group, each group and scenario a disclosure. Small Runs open fully;
 * large ones stay collapsed so no metric row is laid out until it is asked for.
 */
export function ScenarioGroups({
  scenarios,
}: Readonly<{ scenarios: readonly Scenario[] }>) {
  const totalMetrics = scenarios.reduce(
    (sum, scenario) => sum + scenario.metrics.length,
    0,
  );
  const expanded = totalMetrics <= EXPAND_ALL_UP_TO_METRICS;

  return (
    <div className="space-y-3">
      {groupScenarios(scenarios).map((group) => (
        <ScenarioGroupBlock
          key={group.group}
          group={group}
          defaultOpen={expanded}
        />
      ))}
    </div>
  );
}

function ScenarioGroupBlock({
  group,
  defaultOpen,
}: Readonly<{
  group: ReturnType<typeof groupScenarios>[number];
  defaultOpen: boolean;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const { counts } = group;

  return (
    <div className="rounded-lg border">
      <Disclosure
        open={open}
        onToggle={() => setOpen((current) => !current)}
        controls={bodyId}
        level={3}
      >
        <span>{group.title}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {counts.total} {counts.total === 1 ? "scenario" : "scenarios"} ·{" "}
          {counts.completed} completed
          {counts.failed > 0 ? ` · ${counts.failed} failed` : ""}
        </span>
      </Disclosure>
      <div id={bodyId} hidden={!open} className="px-3 pb-3">
        {open ? (
          <ul className="space-y-2">
            {group.scenarios.map((scenario) => (
              <ScenarioBlock
                key={scenario.id}
                scenario={scenario}
                defaultOpen={defaultOpen}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
