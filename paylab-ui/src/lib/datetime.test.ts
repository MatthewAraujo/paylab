import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./datetime";

describe("formatTimestamp", () => {
  it("renders an ISO instant as UTC, independent of the machine timezone", () => {
    expect(formatTimestamp("2026-09-01T10:05:30.123Z")).toBe(
      "2026-09-01 10:05:30 UTC",
    );
    expect(formatTimestamp("2026-09-01T23:59:59.999Z")).toBe(
      "2026-09-01 23:59:59 UTC",
    );
  });
});
