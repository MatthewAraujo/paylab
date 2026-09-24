import { describe, expect, it } from "vitest";
import { groupScenarios, groupTitle } from "./groups";
import type { Scenario } from "./types";

const scenario = (
  id: string,
  group: string,
  status: Scenario["status"] = "COMPLETED",
): Scenario => ({
  id,
  group,
  title: id,
  fingerprint: `fp-${id}`,
  protocol: { repetitions: 1, aggregation: "median" },
  config: {},
  status,
  metrics: [],
});

describe("groupTitle", () => {
  it("names the known experiment families", () => {
    expect(groupTitle("t13")).toBe("Reads and index behavior (T13)");
    expect(groupTitle("t14")).toBe("Concurrency and load (T14)");
  });

  it("gives a future group a readable generic title, so a new benchmark needs no bespoke page", () => {
    expect(groupTitle("queue-latency")).toBe("Queue latency");
    expect(groupTitle("cache_warmup")).toBe("Cache warmup");
    expect(groupTitle("")).toBe("Other");
  });
});

describe("groupScenarios", () => {
  it("groups scenarios in the order each group first appears", () => {
    const groups = groupScenarios([
      scenario("t14.a", "t14"),
      scenario("t13.a", "t13"),
      scenario("t14.b", "t14"),
    ]);

    expect(groups.map((group) => group.group)).toEqual(["t14", "t13"]);
    expect(groups[0].title).toBe("Concurrency and load (T14)");
    expect(groups[0].scenarios.map((s) => s.id)).toEqual(["t14.a", "t14.b"]);
  });

  it("counts each group's scenarios by status", () => {
    const [group] = groupScenarios([
      scenario("a", "g", "COMPLETED"),
      scenario("b", "g", "FAILED"),
      scenario("c", "g", "PENDING"),
      scenario("d", "g", "ACTIVE"),
      scenario("e", "g", "COMPLETED"),
    ]);

    expect(group.counts).toEqual({
      total: 5,
      completed: 2,
      failed: 1,
      pending: 1,
      active: 1,
    });
  });

  it("is empty for a Run with no scenario", () => {
    expect(groupScenarios([])).toEqual([]);
  });
});
