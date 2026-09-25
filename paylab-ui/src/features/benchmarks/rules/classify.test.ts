import { describe, expect, it } from "vitest";
import { classifyChange, STABLE_TOLERANCE_PERCENT } from "./classify";

const higher = "HIGHER_IS_BETTER" as const;
const lower = "LOWER_IS_BETTER" as const;

describe("classifyChange", () => {
  it("states the tolerance as a presentation band, not a significance claim", () => {
    expect(STABLE_TOLERANCE_PERCENT).toBe(5);
  });

  it("treats more throughput as an improvement and keeps the raw deltas", () => {
    expect(
      classifyChange({ current: 110, reference: 100, direction: higher }),
    ).toEqual({
      kind: "compared",
      classification: "improved",
      absoluteDelta: 10,
      percentDelta: 10,
    });
  });

  it("treats less throughput as a regression", () => {
    expect(
      classifyChange({ current: 90, reference: 100, direction: higher }),
    ).toEqual({
      kind: "compared",
      classification: "regressed",
      absoluteDelta: -10,
      percentDelta: -10,
    });
  });

  it("reads lower latency, errors, and contention as an improvement", () => {
    expect(
      classifyChange({ current: 90, reference: 100, direction: lower }),
    ).toMatchObject({ classification: "improved", percentDelta: -10 });
    expect(
      classifyChange({ current: 110, reference: 100, direction: lower }),
    ).toMatchObject({ classification: "regressed", percentDelta: 10 });
  });

  it("is Stable at exactly +5% and -5%, with the raw values still reported", () => {
    expect(
      classifyChange({ current: 105, reference: 100, direction: higher }),
    ).toEqual({
      kind: "compared",
      classification: "stable",
      absoluteDelta: 5,
      percentDelta: 5,
    });
    expect(
      classifyChange({ current: 95, reference: 100, direction: lower }),
    ).toMatchObject({ classification: "stable", percentDelta: -5 });
  });

  it("stays Stable at the boundary when binary floating point is inexact", () => {
    expect(
      classifyChange({ current: 1.05, reference: 1, direction: higher }),
    ).toMatchObject({ classification: "stable" });
  });

  it("leaves the Stable band just past 5%", () => {
    expect(
      classifyChange({ current: 105.1, reference: 100, direction: higher }),
    ).toMatchObject({ classification: "improved" });
    expect(
      classifyChange({ current: 94.9, reference: 100, direction: higher }),
    ).toMatchObject({ classification: "regressed" });
  });

  it("never classifies an informational metric, but still reports its deltas", () => {
    expect(
      classifyChange({ current: 500, reference: 100, direction: "NEUTRAL" }),
    ).toEqual({ kind: "informational", absoluteDelta: 400, percentDelta: 400 });
  });

  it("does not turn a missing value into a number", () => {
    expect(
      classifyChange({ current: undefined, reference: 100, direction: higher }),
    ).toEqual({ kind: "not-recorded" });
    expect(
      classifyChange({ current: 100, reference: undefined, direction: lower }),
    ).toEqual({ kind: "not-recorded" });
    expect(
      classifyChange({
        current: undefined,
        reference: undefined,
        direction: "NEUTRAL",
      }),
    ).toEqual({ kind: "not-recorded" });
  });

  describe("with a reference of zero", () => {
    it("is Stable from 0 to 0, with a delta of 0 and no percentage", () => {
      expect(
        classifyChange({ current: 0, reference: 0, direction: lower }),
      ).toEqual({
        kind: "compared",
        classification: "stable",
        absoluteDelta: 0,
        percentDelta: null,
      });
    });

    it("classifies a move away from zero by direction, so deadlocks 0 to 3 regress", () => {
      expect(
        classifyChange({ current: 3, reference: 0, direction: lower }),
      ).toEqual({
        kind: "compared",
        classification: "regressed",
        absoluteDelta: 3,
        percentDelta: null,
      });
      expect(
        classifyChange({ current: 3, reference: 0, direction: higher }),
      ).toMatchObject({ classification: "improved", percentDelta: null });
    });

    it("reports informational metrics without a percentage", () => {
      expect(
        classifyChange({ current: 7, reference: 0, direction: "NEUTRAL" }),
      ).toEqual({
        kind: "informational",
        absoluteDelta: 7,
        percentDelta: null,
      });
    });
  });
});
