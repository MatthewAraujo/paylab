import { describe, expect, it } from "vitest";
import { dimensionLabel, metricIdentity } from "./identity";

describe("metricIdentity", () => {
  it("is the metric key when there are no dimensions", () => {
    expect(metricIdentity({ key: "tps" })).toBe("tps");
    expect(metricIdentity({ key: "tps", dimensions: {} })).toBe("tps");
  });

  it("adds the dimensions, so two strategies of one scenario never collapse", () => {
    const nokey = metricIdentity({
      key: "tps",
      dimensions: { strategy: "nokey" },
    });
    const advisory = metricIdentity({
      key: "tps",
      dimensions: { strategy: "advisory" },
    });

    expect(nokey).toBe("tps|strategy=nokey");
    expect(advisory).toBe("tps|strategy=advisory");
    expect(nokey).not.toBe(advisory);
  });

  it("does not depend on the order the dimensions were listed in", () => {
    expect(metricIdentity({ key: "m", dimensions: { b: "2", a: "1" } })).toBe(
      metricIdentity({ key: "m", dimensions: { a: "1", b: "2" } }),
    );
    expect(metricIdentity({ key: "m", dimensions: { b: "2", a: "1" } })).toBe(
      "m|a=1|b=2",
    );
  });
});

describe("dimensionLabel", () => {
  it("reads as text a person can scan", () => {
    expect(dimensionLabel({ dimensions: { strategy: "nokey" } })).toBe(
      "strategy: nokey",
    );
    expect(dimensionLabel({ dimensions: { b: "2", a: "1" } })).toBe(
      "a: 1, b: 2",
    );
  });

  it("is empty when the metric has no dimension", () => {
    expect(dimensionLabel({})).toBe("");
    expect(dimensionLabel({ dimensions: {} })).toBe("");
  });
});
