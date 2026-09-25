import { describe, expect, it } from "vitest";
import { trend } from "@/test/benchmark-fixtures";
import {
  buildTimeline,
  directionLabel,
  exclusionLabel,
  lineSegments,
  valueExtent,
} from "./model";

const point = (runId: string, startedAt: string, value: number) => ({
  runId,
  startedAt,
  kind: "native" as const,
  value,
});

describe("buildTimeline", () => {
  it("orders points, Incomplete Runs and exclusions by start time", () => {
    const entries = buildTimeline(
      trend({
        points: [
          point("c", "2026-09-03T00:00:00.000Z", 3),
          point("a", "2026-09-01T00:00:00.000Z", 1),
        ],
        incompleteRuns: [{ runId: "b", startedAt: "2026-09-02T00:00:00.000Z" }],
        excluded: [
          {
            runId: "d",
            startedAt: "2026-09-04T00:00:00.000Z",
            reason: "changed",
          },
        ],
      }),
    );

    expect(entries.map((entry) => [entry.type, entry.runId])).toEqual([
      ["point", "a"],
      ["incomplete", "b"],
      ["point", "c"],
      ["excluded", "d"],
    ]);
  });

  it("flags the Baseline only on a point", () => {
    const entries = buildTimeline(
      trend({
        points: [point("a", "2026-09-01T00:00:00.000Z", 1)],
        incompleteRuns: [{ runId: "b", startedAt: "2026-09-02T00:00:00.000Z" }],
        baselineRunId: "a",
      }),
    );

    expect(entries.map((entry) => entry.isBaseline)).toEqual([true, false]);
  });

  it("does not flag a Baseline that is not one of the points", () => {
    const entries = buildTimeline(
      trend({
        points: [point("a", "2026-09-01T00:00:00.000Z", 1)],
        baselineRunId: "elsewhere",
      }),
    );

    expect(entries.every((entry) => !entry.isBaseline)).toBe(true);
  });

  it("keeps points first when times are equal (imported Runs can share a date)", () => {
    const at = "2026-09-01T00:00:00.000Z";
    const entries = buildTimeline(
      trend({
        points: [point("p1", at, 1), point("p2", at, 2)],
        excluded: [{ runId: "x", startedAt: at, reason: "changed" }],
      }),
    );

    expect(entries.map((entry) => entry.runId)).toEqual(["p1", "p2", "x"]);
  });
});

describe("lineSegments", () => {
  it("joins consecutive points and never crosses an exclusion", () => {
    const entries = buildTimeline(
      trend({
        points: [
          point("a", "2026-09-01T00:00:00.000Z", 1),
          point("b", "2026-09-02T00:00:00.000Z", 2),
          point("d", "2026-09-04T00:00:00.000Z", 4),
        ],
        excluded: [
          {
            runId: "c",
            startedAt: "2026-09-03T00:00:00.000Z",
            reason: "environment-incompatible",
          },
        ],
      }),
    );

    expect(lineSegments(entries)).toEqual([[0, 1], [3]]);
  });

  it("does not break the line at an Incomplete Run", () => {
    const entries = buildTimeline(
      trend({
        points: [
          point("a", "2026-09-01T00:00:00.000Z", 1),
          point("c", "2026-09-03T00:00:00.000Z", 3),
        ],
        incompleteRuns: [{ runId: "b", startedAt: "2026-09-02T00:00:00.000Z" }],
      }),
    );

    expect(lineSegments(entries)).toEqual([[0, 2]]);
  });

  it("has no segments without points", () => {
    expect(lineSegments([])).toEqual([]);
  });
});

describe("valueExtent", () => {
  it("fits the values with a little room", () => {
    const { min, max } = valueExtent([100, 200]);

    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(200);
  });

  it("gives a flat series a visible range", () => {
    const { min, max } = valueExtent([50, 50]);

    expect(max).toBeGreaterThan(min);
    expect((min + max) / 2).toBe(50);
  });

  it("gives a zero-only series a range too", () => {
    const { min, max } = valueExtent([0]);

    expect(max).toBeGreaterThan(min);
  });
});

describe("labels", () => {
  it("states the direction in words", () => {
    expect(directionLabel("HIGHER_IS_BETTER")).toBe("Higher is better");
    expect(directionLabel("LOWER_IS_BETTER")).toBe("Lower is better");
    expect(directionLabel("NEUTRAL")).toBe("Neither direction is better");
    expect(directionLabel(null)).toBe("Direction not recorded");
  });

  it("explains every exclusion reason", () => {
    expect(exclusionLabel("changed")).toBe("Scenario definition changed");
    expect(exclusionLabel("environment-incompatible")).toBe(
      "Different environment",
    );
    expect(exclusionLabel("dataset-incompatible")).toBe("Different dataset");
    expect(exclusionLabel("metric-not-recorded")).toBe("Metric not recorded");
  });
});
