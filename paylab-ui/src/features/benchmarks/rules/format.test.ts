import { describe, expect, it } from "vitest";
import {
  abbreviateCommit,
  compactId,
  compactIds,
  exactInstant,
  formatDelta,
  formatDuration,
  formatInstant,
  formatMetricValue,
  formatNumber,
  formatPercent,
  NOT_RECORDED,
} from "./format";

describe("formatNumber", () => {
  it.each([
    [164.4, "164.4"],
    [62.1, "62.1"],
    [0.108, "0.108"],
    [1234.5, "1,234.5"],
    [1_000_000, "1,000,000"],
    [12.34567, "12.346"],
    [5, "5"],
    [0, "0"],
    [-13.2, "-13.2"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});

describe("formatMetricValue", () => {
  it("keeps the unit next to the value", () => {
    expect(formatMetricValue(164.4, "tx/s")).toBe("164.4 tx/s");
    expect(formatMetricValue(746.6, "ms")).toBe("746.6 ms");
  });

  it("shows a missing value as not recorded and never as zero", () => {
    expect(NOT_RECORDED).toBe("Not recorded");
    expect(formatMetricValue(undefined, "ms")).toBe("Not recorded");
    expect(formatMetricValue(0, "ms")).toBe("0 ms");
  });

  it("leaves off the unit of a plain count or an empty unit", () => {
    expect(formatMetricValue(3, "count")).toBe("3");
    expect(formatMetricValue(2.5, "")).toBe("2.5");
  });
});

describe("formatDelta", () => {
  it("signs a change and keeps its unit", () => {
    expect(formatDelta(13.2, "tx/s")).toBe("+13.2 tx/s");
    expect(formatDelta(-45.3, "ms")).toBe("-45.3 ms");
  });

  it("does not sign a zero delta", () => {
    expect(formatDelta(0, "tx/s")).toBe("0 tx/s");
  });
});

describe("formatPercent", () => {
  it.each([
    [8.7, "+8.7%"],
    [-6.5, "-6.5%"],
    [5, "+5.0%"],
    [-5, "-5.0%"],
    [0, "0.0%"],
    [8.66, "+8.7%"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  it("says a percentage is not applicable rather than inventing one", () => {
    expect(formatPercent(null)).toBe("Not applicable");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 ms"],
    [500, "500 ms"],
    [12_400, "12.4 s"],
    [12_000, "12 s"],
    [60_000, "1m 0s"],
    [946_000, "15m 46s"],
    [4_704_000, "78m 24s"],
  ])("formats %s ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it("is not recorded for an unknown duration", () => {
    expect(formatDuration(undefined)).toBe("Not recorded");
  });
});

describe("instants", () => {
  it("displays every instant in UTC, as the rest of the console does", () => {
    expect(formatInstant("2026-09-23T21:28:52.000Z")).toBe(
      "2026-09-23 21:28:52 UTC",
    );
  });

  it("keeps the exact instant available", () => {
    expect(exactInstant("2026-09-23T21:28:52Z")).toBe(
      "2026-09-23T21:28:52.000Z",
    );
  });
});

describe("abbreviateCommit", () => {
  it("shortens a full hash to seven characters", () => {
    expect(abbreviateCommit("8a2c91f0d4e5b6a7c8d9e0f1a2b3c4d5e6f70819")).toBe(
      "8a2c91f",
    );
  });

  it("leaves a short value or the unknown marker of an imported Run as it is", () => {
    expect(abbreviateCommit("8a2c91f")).toBe("8a2c91f");
    expect(abbreviateCommit("unknown")).toBe("unknown");
  });
});

describe("compactId", () => {
  it("shortens a long identifier and keeps both ends", () => {
    expect(compactId("2026-09-23T10-00-00Z-abc1234")).toBe("2026-09-…bc1234");
  });

  it("leaves a short identifier alone", () => {
    expect(compactId("run-1")).toBe("run-1");
    expect(compactId("imported-t14-load-v2")).toBe("imported-t14-load-v2");
  });
});

describe("compactIds", () => {
  it("never lets two different identifiers look identical", () => {
    const a = "2026-09-23T10-00-00Z-aaaa1234";
    const b = "2026-09-23T11-00-00Z-aaaa1234";

    const compact = compactIds([a, b]);

    expect(compactId(a)).toBe(compactId(b));
    expect(compact.get(a)).not.toBe(compact.get(b));
  });

  it("is the plain compaction when there is no collision", () => {
    const only = "2026-09-23T10-00-00Z-abc1234";

    expect(compactIds([only, "run-1"]).get(only)).toBe(compactId(only));
    expect(compactIds([only, "run-1"]).get("run-1")).toBe("run-1");
  });

  it("maps a repeated identifier to one compact form", () => {
    const id = "2026-09-23T10-00-00Z-abc1234";

    expect(compactIds([id, id]).size).toBe(1);
  });
});
