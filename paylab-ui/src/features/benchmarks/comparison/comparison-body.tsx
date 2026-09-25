"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { components } from "@/api/generated/schema";
import { BenchmarkFailureState } from "@/components/benchmarks/benchmark-failure-state";
import { CompatibilityBadge } from "@/components/benchmarks/compatibility-badge";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { useRun } from "../api/hooks";
import { BenchmarkRequestError } from "../api/results";
import {
  type ComparisonState,
  compareScenario,
  groupTitle,
  type ScenarioComparison,
  summarizeComparison,
} from "../rules";
import { Disclosure } from "../run-detail/scenario-groups";
import { ComparisonTable } from "./comparison-table";

type Comparison = components["schemas"]["ComparisonResponse"];
type Detail = NonNullable<Comparison["comparison"]>;

/** More comparable metric rows than this opens collapsed, so no table is laid out up front. */
export const EXPAND_ALL_UP_TO_ROWS = 100;

const REASONS: Partial<Record<ComparisonState, string>> = {
  new: "This scenario exists only in the current Run, so there is no previous measurement.",
  removed:
    "This scenario exists only in the reference Run, so there is no current measurement.",
  changed:
    "The scenario definition differs between the Runs, so no delta is shown.",
  "environment-incompatible":
    "The environment differs between the Runs, so no delta is shown.",
  "dataset-incompatible":
    "The dataset differs between the Runs, so no delta is shown.",
};

type Entry = ScenarioComparison & { title: string; group: string };

function Compatibility({
  detail,
  kinds,
}: Readonly<{ detail: Detail; kinds: [string, string] }>) {
  const row = (ok: boolean, label: string) => {
    const Icon = ok ? CircleCheck : TriangleAlert;
    return (
      <p className="flex items-center gap-2 text-sm">
        <Icon aria-hidden="true" className="size-4" />
        <span>{`${label} ${ok ? "compatible" : "incompatible"}`}</span>
      </p>
    );
  };

  return (
    <section aria-labelledby="compat-heading" className="space-y-2">
      <h2 id="compat-heading" className="text-base font-semibold">
        Compatibility
      </h2>
      {row(detail.environmentCompatible, "Environment")}
      {row(detail.datasetCompatible, "Dataset")}
      {kinds[0] !== kinds[1] ? (
        <p className="text-xs text-muted-foreground">
          One Run is Imported and the other native. Their differences are
          evidence of a changed definition or environment, not an error.
        </p>
      ) : null}
    </section>
  );
}

function Summary({ entries }: Readonly<{ entries: Entry[] }>) {
  const { scenarios, metrics } = summarizeComparison(entries);
  const tiles: [string, number][] = [
    ["Improved", metrics.improved],
    ["Stable", metrics.stable],
    ["Regressed", metrics.regressed],
    ["Incompatible", scenarios.incompatible],
    ["Not recorded", metrics.notRecorded],
  ];

  return (
    <section aria-labelledby="summary-heading" className="space-y-3">
      <h2 id="summary-heading" className="text-base font-semibold">
        Summary
      </h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map(([label, count]) => (
          <div key={label} className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Improved, Stable and Regressed count metrics of comparable scenarios.
        Incompatible counts scenarios whose environment or dataset differs; Not
        recorded counts metrics present on one side only. Stable means within
        ±5% of the reference, a presentation tolerance and not statistical
        significance.
      </p>
      <p className="text-xs text-muted-foreground">
        Scenarios: {scenarios.comparable} comparable, {scenarios.new} new,{" "}
        {scenarios.removed} removed, {scenarios.changed} changed definition.
        {metrics.informational > 0
          ? ` ${metrics.informational} informational metrics are shown without a classification.`
          : ""}
      </p>
    </section>
  );
}

function ScenarioEntry({
  entry,
  defaultOpen,
}: Readonly<{ entry: Entry; defaultOpen: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const comparable = entry.state === "comparable";

  return (
    <li className="space-y-2 rounded-md border p-2">
      {comparable ? (
        <Disclosure
          open={open}
          onToggle={() => setOpen((current) => !current)}
          controls={bodyId}
          level={4}
        >
          <span>{entry.title}</span>
          <code className="font-mono text-xs font-normal text-muted-foreground">
            {entry.scenarioId}
          </code>
          <span className="text-xs font-normal text-muted-foreground">
            {entry.rows.length} {entry.rows.length === 1 ? "metric" : "metrics"}
          </span>
        </Disclosure>
      ) : (
        <div className="px-2">
          <h4 className="text-sm font-semibold">{entry.title}</h4>
          <code className="font-mono text-xs text-muted-foreground">
            {entry.scenarioId}
          </code>
        </div>
      )}
      <div className="px-2">
        <CompatibilityBadge state={entry.state} />
        {REASONS[entry.state] ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {REASONS[entry.state]}
          </p>
        ) : null}
      </div>
      {comparable ? (
        <div id={bodyId} hidden={!open} className="px-2">
          {open ? (
            <ComparisonTable scenarioTitle={entry.title} rows={entry.rows} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function GroupEntry({
  group,
  entries,
  defaultOpen,
}: Readonly<{ group: string; entries: Entry[]; defaultOpen: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const comparable = entries.filter((e) => e.state === "comparable").length;

  return (
    <div className="rounded-lg border">
      <Disclosure
        open={open}
        onToggle={() => setOpen((current) => !current)}
        controls={bodyId}
        level={3}
      >
        <span>{groupTitle(group)}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {entries.length} {entries.length === 1 ? "scenario" : "scenarios"} ·{" "}
          {comparable} comparable
        </span>
      </Disclosure>
      <div id={bodyId} hidden={!open} className="px-3 pb-3">
        {open ? (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <ScenarioEntry
                key={entry.scenarioId}
                entry={entry}
                defaultOpen={defaultOpen}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The comparison of two completed Runs. Compatibility comes from the API; every number and
 * classification is computed here from the two Run records, and only for comparable scenarios.
 */
export function ComparisonBody({
  comparison,
  baseUrl,
}: Readonly<{ comparison: Comparison; baseUrl?: string }>) {
  const currentId = comparison.current?.runId ?? "";
  const referenceId = comparison.reference?.runId ?? "";
  const current = useRun(currentId, { baseUrl });
  const reference = useRun(referenceId, { baseUrl });
  const detail = comparison.comparison;

  const failed = current.error ?? reference.error;
  if (failed && (!current.data || !reference.data)) {
    return (
      <BenchmarkFailureState
        failure={
          failed instanceof BenchmarkRequestError
            ? failed.failure
            : { kind: "unreachable", message: String(failed) }
        }
        onRetry={() => {
          void current.refetch();
          void reference.refetch();
        }}
      />
    );
  }
  if (!current.data || !reference.data || !detail) {
    return <BenchmarkLoading label="Loading the compared Runs" />;
  }

  const now = new Map(current.data.scenarios.map((s) => [s.id, s]));
  const before = new Map(reference.data.scenarios.map((s) => [s.id, s]));
  const entries: Entry[] = detail.scenarios.map(({ scenarioId, state }) => {
    const currentScenario = now.get(scenarioId);
    const referenceScenario = before.get(scenarioId);
    const described = currentScenario ?? referenceScenario;
    return {
      ...compareScenario({
        scenarioId,
        state,
        current: currentScenario,
        reference: referenceScenario,
      }),
      title: described?.title ?? scenarioId,
      group: described?.group ?? scenarioId.split(".")[0],
    };
  });

  const totalRows = entries.reduce((sum, e) => sum + e.rows.length, 0);
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }

  return (
    <div className="space-y-8">
      <Compatibility
        detail={detail}
        kinds={[current.data.kind, reference.data.kind]}
      />
      <Summary entries={entries} />
      <section aria-labelledby="scenarios-heading" className="space-y-3">
        <h2 id="scenarios-heading" className="text-base font-semibold">
          Scenarios
        </h2>
        {[...groups].map(([group, list]) => (
          <GroupEntry
            key={group}
            group={group}
            entries={list}
            defaultOpen={totalRows <= EXPAND_ALL_UP_TO_ROWS}
          />
        ))}
      </section>
    </div>
  );
}
