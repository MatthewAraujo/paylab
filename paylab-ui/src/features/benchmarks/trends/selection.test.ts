import { describe, expect, it } from "vitest";
import { metric, scenario } from "@/test/benchmark-fixtures";
import {
  dimensionLabel,
  dimensionsOf,
  metricsOf,
  parseSelection,
  resolveSelection,
  selectionToQuery,
} from "./selection";

const scenarios = [
  scenario({
    id: "s1",
    metrics: [
      metric({
        key: "tps",
        label: "Throughput",
        dimensions: { strategy: "nokey" },
      }),
      metric({
        key: "tps",
        label: "Throughput",
        dimensions: { strategy: "key" },
      }),
      metric({
        key: "p99",
        label: "p99 latency",
        unit: "ms",
        dimensions: undefined,
      }),
    ],
  }),
  scenario({ id: "s2", metrics: [metric({ key: "rows", label: "Rows" })] }),
];

describe("parseSelection", () => {
  it("reads scenario, metric and repeated dimensions from the address", () => {
    const selection = parseSelection(
      new URLSearchParams(
        "scenario=s1&metric=tps&dimension=strategy:nokey&dimension=shape:M",
      ),
    );

    expect(selection).toEqual({
      scenarioId: "s1",
      metric: "tps",
      dimensions: { strategy: "nokey", shape: "M" },
    });
  });

  it("is empty for an empty address", () => {
    expect(parseSelection(new URLSearchParams(""))).toEqual({
      scenarioId: undefined,
      metric: undefined,
      dimensions: {},
    });
  });

  it("ignores a dimension without a value separator and keeps colons in values", () => {
    const selection = parseSelection(
      new URLSearchParams("dimension=broken&dimension=at:10:30"),
    );

    expect(selection.dimensions).toEqual({ at: "10:30" });
  });
});

describe("selectionToQuery", () => {
  it("round-trips through parseSelection", () => {
    const selection = {
      scenarioId: "s1",
      metric: "tps",
      dimensions: { strategy: "nokey" },
    };

    expect(
      parseSelection(new URLSearchParams(selectionToQuery(selection))),
    ).toEqual(selection);
  });

  it("omits what is not selected", () => {
    expect(
      selectionToQuery({ scenarioId: "s1", metric: undefined, dimensions: {} }),
    ).toBe("scenario=s1");
  });
});

describe("options", () => {
  it("lists a metric once per key", () => {
    expect(metricsOf(scenarios, "s1").map((item) => item.key)).toEqual([
      "tps",
      "p99",
    ]);
  });

  it("lists the dimension variants of a metric, and none for a metric without", () => {
    expect(dimensionsOf(scenarios, "s1", "tps")).toEqual([
      { strategy: "nokey" },
      { strategy: "key" },
    ]);
    expect(dimensionsOf(scenarios, "s1", "p99")).toEqual([]);
  });

  it("labels a dimension set", () => {
    expect(dimensionLabel({ strategy: "nokey", shape: "M" })).toBe(
      "strategy: nokey, shape: M",
    );
    expect(dimensionLabel({})).toBe("No dimension");
  });
});

describe("resolveSelection", () => {
  it("defaults to the first scenario, its first metric and first variant", () => {
    expect(
      resolveSelection(parseSelection(new URLSearchParams("")), scenarios),
    ).toEqual({
      scenarioId: "s1",
      metric: "tps",
      dimensions: { strategy: "nokey" },
    });
  });

  it("keeps what the address chose, even when it is not among the options", () => {
    expect(
      resolveSelection(
        parseSelection(new URLSearchParams("scenario=gone&metric=x")),
        scenarios,
      ),
    ).toEqual({ scenarioId: "gone", metric: "x", dimensions: {} });
  });

  it("fills a missing metric from the chosen scenario", () => {
    expect(
      resolveSelection(
        parseSelection(new URLSearchParams("scenario=s2")),
        scenarios,
      ),
    ).toMatchObject({ scenarioId: "s2", metric: "rows" });
  });

  it("has no selection without scenarios and without an address", () => {
    expect(
      resolveSelection(parseSelection(new URLSearchParams("")), []),
    ).toEqual({ scenarioId: undefined, metric: undefined, dimensions: {} });
  });
});
