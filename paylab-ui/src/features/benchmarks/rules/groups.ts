import type { Scenario } from "./types";

const KNOWN_GROUPS: Record<string, string> = {
  t13: "Reads and index behavior (T13)",
  t14: "Concurrency and load (T14)",
};

/** A readable title for a scenario group; a future group gets a generic one from its id. */
export function groupTitle(group: string): string {
  const known = KNOWN_GROUPS[group];
  if (known) {
    return known;
  }
  const words = group.replace(/[-_]+/g, " ").trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Other";
}

export type StatusCounts = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  active: number;
};

export type ScenarioGroup = {
  group: string;
  title: string;
  scenarios: Scenario[];
  counts: StatusCounts;
};

/** Scenarios grouped by their `group`, in the order each group first appears. */
export function groupScenarios(
  scenarios: readonly Scenario[],
): ScenarioGroup[] {
  const groups = new Map<string, ScenarioGroup>();
  for (const scenario of scenarios) {
    let entry = groups.get(scenario.group);
    if (!entry) {
      entry = {
        group: scenario.group,
        title: groupTitle(scenario.group),
        scenarios: [],
        counts: { total: 0, completed: 0, failed: 0, pending: 0, active: 0 },
      };
      groups.set(scenario.group, entry);
    }
    entry.scenarios.push(scenario);
    entry.counts.total += 1;
    const status = scenario.status.toLowerCase() as
      | "completed"
      | "failed"
      | "pending"
      | "active";
    entry.counts[status] += 1;
  }
  return [...groups.values()];
}
