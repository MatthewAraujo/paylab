import { describe, expect, it } from "vitest";
import { deriveCapabilities } from "./capabilities";

describe("deriveCapabilities", () => {
  it("keeps financial capabilities unavailable when OpenAPI has paths but no schemas", () => {
    const capabilities = deriveCapabilities({
      paths: {
        "/health": { get: { responses: { 200: { description: "" } } } },
        "/v1/accounts": {
          post: { responses: { 201: { description: "" } } },
        },
        "/v1/accounts/{id}": {
          get: { responses: { 200: { description: "" } } },
        },
      },
    });

    expect(capabilities).toEqual({
      health: true,
      dashboard: false,
      accounts: false,
      payments: false,
      ledger: false,
    });
  });
});

const typed = {
  200: { description: "", content: { "application/json": { schema: {} } } },
};

describe("deriveCapabilities for a read-only console", () => {
  it("enables each area from its typed GET responses alone, without request bodies", () => {
    const capabilities = deriveCapabilities({
      paths: {
        "/health": { get: { responses: { 200: { description: "" } } } },
        "/v1/accounts": { get: { responses: typed } },
        "/v1/accounts/{id}": { get: { responses: typed } },
        "/v1/accounts/{id}/balance": { get: { responses: typed } },
        "/v1/accounts/{id}/entries": { get: { responses: typed } },
        "/v1/payments": { get: { responses: typed } },
        "/v1/payments/{id}": { get: { responses: typed } },
        "/v1/reports/daily": { get: { responses: typed } },
      },
    });

    expect(capabilities).toEqual({
      health: true,
      dashboard: true,
      accounts: true,
      payments: true,
      ledger: true,
    });
  });

  it("keeps Accounts unavailable when the Wallet list is not typed", () => {
    const capabilities = deriveCapabilities({
      paths: {
        "/v1/accounts": { get: { responses: { 200: { description: "" } } } },
        "/v1/accounts/{id}": { get: { responses: typed } },
        "/v1/accounts/{id}/balance": { get: { responses: typed } },
      },
    });

    expect(capabilities.accounts).toBe(false);
  });

  it("keeps Payments unavailable when the list or the detail is missing", () => {
    expect(
      deriveCapabilities({
        paths: { "/v1/payments": { get: { responses: typed } } },
      }).payments,
    ).toBe(false);
  });
});
