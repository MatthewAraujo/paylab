import { describe, expect, it } from "vitest";
import {
  defaultHeadlineScenario,
  HEADLINE_ROLES,
  headlineByRole,
  headlineScenarios,
} from "./headline";
import type { HeadlineMetric } from "./types";

const headline = (
  scenarioId: string,
  summaryRole: HeadlineMetric["summaryRole"],
  value: number,
  dimensions?: Record<string, string>,
): HeadlineMetric => ({
  scenarioId,
  key: summaryRole === "THROUGHPUT" ? "tps" : "latency_p99_ms",
  label: summaryRole,
  unit: summaryRole === "THROUGHPUT" ? "tx/s" : "ms",
  value,
  summaryRole,
  dimensions,
});

describe("headlineScenarios", () => {
  it("groups the declared highlights by scenario, in the order the Run lists them", () => {
    const groups = headlineScenarios([
      headline("t14.load.H.c4.sync-off", "THROUGHPUT", 100),
      headline("t14.load.H.c4.sync-off", "LATENCY_P99", 12),
      headline("t14.load.M.c16.sync-on", "THROUGHPUT", 80),
    ]);

    expect(groups.map((group) => group.scenarioId)).toEqual([
      "t14.load.H.c4.sync-off",
      "t14.load.M.c16.sync-on",
    ]);
    expect(groups[0].metrics.map((metric) => metric.value)).toEqual([100, 12]);
    expect(groups[1].metrics).toHaveLength(1);
  });

  it("is empty when the Run declares no highlight: nothing is chosen for it", () => {
    expect(headlineScenarios([])).toEqual([]);
    expect(defaultHeadlineScenario([])).toBeNull();
  });
});

describe("defaultHeadlineScenario", () => {
  it("is the first scenario that declares highlights, whatever its name or values", () => {
    const groups = headlineScenarios([
      headline("z-last-alphabetically", "THROUGHPUT", 1),
      headline("a-first-alphabetically", "THROUGHPUT", 9999),
    ]);

    expect(defaultHeadlineScenario(groups)).toBe("z-last-alphabetically");
  });
});

describe("headlineByRole", () => {
  it("lists the four roles the console understands", () => {
    expect(HEADLINE_ROLES).toEqual([
      "THROUGHPUT",
      "LATENCY_P99",
      "ERROR_RATE",
      "DURATION",
    ]);
  });

  it("returns only the roles that are declared, so the rest can say 'not declared'", () => {
    const byRole = headlineByRole([
      headline("s", "THROUGHPUT", 100),
      headline("s", "LATENCY_P99", 12),
    ]);

    expect(Object.keys(byRole)).toEqual(["THROUGHPUT", "LATENCY_P99"]);
    expect(byRole.ERROR_RATE).toBeUndefined();
    expect(byRole.DURATION).toBeUndefined();
  });

  it("keeps every metric of a role, such as one per strategy", () => {
    const byRole = headlineByRole([
      headline("s", "THROUGHPUT", 100, { strategy: "nokey" }),
      headline("s", "THROUGHPUT", 90, { strategy: "advisory" }),
    ]);

    expect(byRole.THROUGHPUT?.map((metric) => metric.value)).toEqual([100, 90]);
  });
});
