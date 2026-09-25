import { describe, expect, it } from "vitest";
import {
  compareScenario,
  pairMetrics,
  summarizeComparison,
  summarizeRows,
} from "./comparison";
import type { Metric, Scenario } from "./types";

const metric = (overrides: Partial<Metric> & Pick<Metric, "key">): Metric => ({
  label: overrides.key,
  unit: "",
  direction: "HIGHER_IS_BETTER",
  value: 0,
  ...overrides,
});

const scenario = (id: string, metrics: Metric[]): Scenario => ({
  id,
  group: "t14",
  title: id,
  fingerprint: `fp-${id}`,
  protocol: { repetitions: 3, aggregation: "median" },
  config: {},
  status: "COMPLETED",
  metrics,
});

describe("pairMetrics", () => {
  it("pairs by identity and computes the change of each pair", () => {
    const rows = pairMetrics(
      [
        metric({ key: "tps", unit: "tx/s", value: 110 }),
        metric({
          key: "p99",
          unit: "ms",
          direction: "LOWER_IS_BETTER",
          value: 10,
        }),
      ],
      [
        metric({ key: "tps", unit: "tx/s", value: 100 }),
        metric({
          key: "p99",
          unit: "ms",
          direction: "LOWER_IS_BETTER",
          value: 10.5,
        }),
      ],
    );

    expect(rows.map((row) => [row.key, row.current, row.reference])).toEqual([
      ["tps", 110, 100],
      ["p99", 10, 10.5],
    ]);
    expect(rows[0].change).toMatchObject({ classification: "improved" });
    expect(rows[1].change).toMatchObject({ classification: "stable" });
    expect(rows[0]).toMatchObject({
      label: "tps",
      unit: "tx/s",
      direction: "HIGHER_IS_BETTER",
    });
  });

  it("marks a metric on one side only as not recorded, never as zero", () => {
    const rows = pairMetrics(
      [metric({ key: "tps", value: 100 }), metric({ key: "new", value: 5 })],
      [metric({ key: "tps", value: 100 }), metric({ key: "gone", value: 7 })],
    );

    expect(rows.map((row) => row.key)).toEqual(["tps", "new", "gone"]);
    expect(rows[1]).toMatchObject({
      current: 5,
      change: { kind: "not-recorded" },
    });
    expect(rows[1].reference).toBeUndefined();
    expect(rows[2]).toMatchObject({
      reference: 7,
      change: { kind: "not-recorded" },
    });
    expect(rows[2].current).toBeUndefined();
  });

  it("treats a recorded zero as a value: 0 to 0 is Stable, not missing", () => {
    const rows = pairMetrics(
      [metric({ key: "deadlocks", direction: "LOWER_IS_BETTER", value: 0 })],
      [metric({ key: "deadlocks", direction: "LOWER_IS_BETTER", value: 0 })],
    );

    expect(rows[0].change).toEqual({
      kind: "compared",
      classification: "stable",
      absoluteDelta: 0,
      percentDelta: null,
    });
  });

  it("keeps the strategies of one scenario apart", () => {
    const rows = pairMetrics(
      [
        metric({ key: "tps", value: 100, dimensions: { strategy: "nokey" } }),
        metric({ key: "tps", value: 50, dimensions: { strategy: "advisory" } }),
      ],
      [metric({ key: "tps", value: 100, dimensions: { strategy: "nokey" } })],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      identity: "tps|strategy=nokey",
      change: { classification: "stable" },
    });
    expect(rows[1]).toMatchObject({
      identity: "tps|strategy=advisory",
      change: { kind: "not-recorded" },
    });
  });

  it("does not classify an informational metric", () => {
    const rows = pairMetrics(
      [metric({ key: "lock_samples", direction: "NEUTRAL", value: 400 })],
      [metric({ key: "lock_samples", direction: "NEUTRAL", value: 100 })],
    );

    expect(rows[0].change).toMatchObject({ kind: "informational" });
  });

  it("returns nothing when neither side has metrics", () => {
    expect(pairMetrics(undefined, undefined)).toEqual([]);
  });
});

describe("summarizeRows", () => {
  it("counts each outcome separately, so the health of the evidence is not blurred", () => {
    const rows = pairMetrics(
      [
        metric({ key: "a", value: 110 }),
        metric({ key: "b", value: 100 }),
        metric({ key: "c", value: 50 }),
        metric({ key: "d", value: 1, direction: "NEUTRAL" }),
        metric({ key: "e", value: 3 }),
      ],
      [
        metric({ key: "a", value: 100 }),
        metric({ key: "b", value: 100 }),
        metric({ key: "c", value: 100 }),
        metric({ key: "d", value: 9, direction: "NEUTRAL" }),
        metric({ key: "f", value: 3 }),
      ],
    );

    expect(summarizeRows(rows)).toEqual({
      improved: 1,
      stable: 1,
      regressed: 1,
      informational: 1,
      notRecorded: 2,
    });
  });
});

describe("compareScenario", () => {
  const current = scenario("hot", [metric({ key: "tps", value: 110 })]);
  const reference = scenario("hot", [metric({ key: "tps", value: 100 })]);

  it("computes rows only for a comparable scenario", () => {
    const result = compareScenario({
      scenarioId: "hot",
      state: "comparable",
      current,
      reference,
    });

    expect(result.state).toBe("comparable");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].change).toMatchObject({ classification: "improved" });
  });

  it.each([
    "changed",
    "environment-incompatible",
    "dataset-incompatible",
    "new",
    "removed",
  ] as const)("computes no delta for a %s scenario", (state) => {
    const result = compareScenario({
      scenarioId: "hot",
      state,
      current,
      reference,
    });

    expect(result).toEqual({ scenarioId: "hot", state, rows: [] });
  });
});

describe("summarizeComparison", () => {
  it("counts scenarios by state and metrics over the comparable ones only", () => {
    const comparable = (id: string, cur: number, ref: number) =>
      compareScenario({
        scenarioId: id,
        state: "comparable",
        current: scenario(id, [metric({ key: "tps", value: cur })]),
        reference: scenario(id, [metric({ key: "tps", value: ref })]),
      });
    const other = (
      id: string,
      state: Parameters<typeof compareScenario>[0]["state"],
    ) => compareScenario({ scenarioId: id, state });

    const summary = summarizeComparison([
      comparable("a", 120, 100),
      comparable("b", 100, 100),
      comparable("c", 60, 100),
      other("d", "changed"),
      other("e", "environment-incompatible"),
      other("f", "dataset-incompatible"),
      other("g", "new"),
      other("h", "removed"),
    ]);

    expect(summary).toEqual({
      scenarios: {
        comparable: 3,
        new: 1,
        removed: 1,
        changed: 1,
        incompatible: 2,
      },
      metrics: {
        improved: 1,
        stable: 1,
        regressed: 1,
        informational: 0,
        notRecorded: 0,
      },
    });
  });
});
