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
        cursor: "abc",
      }),
    ).toEqual({
      status: "FAILED",
      accountId: "5b0b6d0e-7c5e-4d3e-9d0a-000000000000",
      from: "2026-09-01",
      to: "2026-09-30",
      cursor: "abc",
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
  it("ignores the cursor: paging is not filtering", () => {
    expect(hasActiveFilters({ cursor: "abc" })).toBe(false);
    expect(hasActiveFilters({ status: "FAILED" })).toBe(true);
  });
});

describe("paymentsHref", () => {
  it("keeps the filters and sets the cursor of the requested page", () => {
    expect(paymentsHref({ status: "FAILED", from: "2026-09-01" }, "next")).toBe(
      "/payments?status=FAILED&from=2026-09-01&cursor=next",
    );
  });

  it("is the bare route without filters or cursor", () => {
    expect(paymentsHref({})).toBe("/payments");
  });
});
