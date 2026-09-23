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
