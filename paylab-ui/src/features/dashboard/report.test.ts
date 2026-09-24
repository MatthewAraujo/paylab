import { describe, expect, it } from "vitest";
import { defaultRange, parseRange, summarize } from "./report";

describe("defaultRange", () => {
  it("covers the last 7 UTC days ending today, inclusive", () => {
    expect(defaultRange(new Date("2026-09-10T02:00:00.000Z"))).toEqual({
      from: "2026-09-04",
      to: "2026-09-10",
    });
  });

  it("uses the UTC day even when local time is still the day before", () => {
    expect(defaultRange(new Date("2026-09-01T00:30:00.000Z"))).toEqual({
      from: "2026-08-26",
      to: "2026-09-01",
    });
  });
});

describe("parseRange", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("accepts valid calendar days", () => {
    expect(parseRange({ from: "2026-09-01", to: "2026-09-05" }, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-05",
    });
  });

  it("falls back to the default range when a day is missing or not a real date", () => {
    const fallback = { from: "2026-09-04", to: "2026-09-10" };
    expect(parseRange({}, now)).toEqual(fallback);
    expect(parseRange({ from: "2026-02-30", to: "2026-09-05" }, now)).toEqual(
      fallback,
    );
    expect(parseRange({ from: "yesterday", to: "2026-09-05" }, now)).toEqual(
      fallback,
    );
  });
});

describe("summarize", () => {
  it("adds counts and volumes per status from the report rows", () => {
    const summary = summarize([
      { date: "2026-09-01", status: "SUCCEEDED", count: 2, volume: 300 },
      { date: "2026-09-01", status: "FAILED", count: 1, volume: 50 },
      { date: "2026-09-02", status: "SUCCEEDED", count: 1, volume: 100 },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.byStatus.SUCCEEDED).toEqual({ count: 3, volume: 400 });
    expect(summary.byStatus.FAILED).toEqual({ count: 1, volume: 50 });
    expect(summary.byStatus.CREATED).toEqual({ count: 0, volume: 0 });
  });
});
