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
      benchmarks: false,
      benchmarkBaselineWrite: false,
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
      benchmarks: false,
      benchmarkBaselineWrite: false,
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

const benchmarkReads = {
  "/v1/benchmarks/status": { get: { responses: typed } },
  "/v1/benchmarks/runs": { get: { responses: typed } },
  "/v1/benchmarks/runs/{runId}": { get: { responses: typed } },
  "/v1/benchmarks/runs/{runId}/progress": { get: { responses: typed } },
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}": {
    get: { responses: typed },
  },
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content": {
    get: { responses: typed },
  },
  "/v1/benchmarks/comparisons/default": { get: { responses: typed } },
  "/v1/benchmarks/comparisons": { get: { responses: typed } },
  "/v1/benchmarks/trends": { get: { responses: typed } },
  "/v1/benchmarks/baseline": { get: { responses: typed } },
};

describe("deriveCapabilities for Benchmarks", () => {
  it("enables Benchmarks from its typed reads, and the Baseline write from the typed PUT alone", () => {
    const reads = deriveCapabilities({ paths: benchmarkReads });
    const withWrite = deriveCapabilities({
      paths: {
        ...benchmarkReads,
        "/v1/benchmarks/baseline": {
          get: { responses: typed },
          put: { responses: typed },
        },
      },
    });

    expect(reads.benchmarks).toBe(true);
    expect(reads.benchmarkBaselineWrite).toBe(false);
    expect(withWrite.benchmarks).toBe(true);
    expect(withWrite.benchmarkBaselineWrite).toBe(true);
  });

  it("does not require the Baseline write, or the Artifact download, for read-only Benchmarks", () => {
    const capabilities = deriveCapabilities({ paths: benchmarkReads });

    expect(capabilities.benchmarks).toBe(true);
  });

  it("stays unavailable when the routes are missing", () => {
    expect(deriveCapabilities({ paths: {} }).benchmarks).toBe(false);
  });

  it("stays unavailable when any read route has no JSON response schema", () => {
    for (const route of Object.keys(benchmarkReads)) {
      const untyped = {
        ...benchmarkReads,
        [route]: { get: { responses: { 200: { description: "" } } } },
      };

      expect(deriveCapabilities({ paths: untyped }).benchmarks, route).toBe(
        false,
      );
    }
  });

  it("keeps the financial capabilities independent of Benchmarks", () => {
    const capabilities = deriveCapabilities({ paths: benchmarkReads });

    expect(capabilities).toMatchObject({
      dashboard: false,
      accounts: false,
      payments: false,
      ledger: false,
    });
  });
});
