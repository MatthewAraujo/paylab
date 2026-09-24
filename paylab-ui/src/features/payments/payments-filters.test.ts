import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parsePaymentFilters,
  paymentsHref,
} from "./payments-filters";

describe("parsePaymentFilters", () => {
  it("reads status, account and period, trimming blanks", () => {
    expect(
      parsePaymentFilters({
        status: "FAILED",
        accountId: " 5b0b6d0e-7c5e-4d3e-9d0a-000000000000 ",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toEqual({
      status: "FAILED",
      accountId: "5b0b6d0e-7c5e-4d3e-9d0a-000000000000",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("drops empty values and statuses the API does not define", () => {
    expect(
      parsePaymentFilters({ status: "REFUNDED", accountId: "  ", from: "" }),
    ).toEqual({});
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parsePaymentFilters({ status: ["SUCCEEDED", "FAILED"] })).toEqual({
      status: "SUCCEEDED",
    });
  });
});

describe("hasActiveFilters", () => {
  it("is true when any filter is set and false when none is", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ status: "FAILED" })).toBe(true);
    expect(hasActiveFilters({ from: "2026-09-01" })).toBe(true);
  });
});

describe("paymentsHref", () => {
  it("keeps the filters and sets the page trail", () => {
    expect(
      paymentsHref({ status: "FAILED", from: "2026-09-01" }, ["next"]),
    ).toBe("/payments?status=FAILED&from=2026-09-01&pages=next");
  });

  it("is the bare route without filters or trail", () => {
    expect(paymentsHref({})).toBe("/payments");
  });
});
