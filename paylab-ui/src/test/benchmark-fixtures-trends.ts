import { type Trend, trend } from "./benchmark-fixtures";

/** A trend of `count` native points, one per day, with a gently rising value. */
export function denseTrend(count: number, overrides: Partial<Trend> = {}) {
  const points = Array.from({ length: count }, (_, index) => {
    const startedAt = new Date(
      Date.UTC(2026, 0, 1 + index, 12, 0, 0),
    ).toISOString();
    return {
      runId: `${startedAt.slice(0, 19).replace(/:/g, "-")}Z-${String(index).padStart(7, "0")}`,
      startedAt,
      kind: "native" as const,
      value: 100 + index,
    };
  });
  return trend({ points, reference: null, ...overrides });
}
