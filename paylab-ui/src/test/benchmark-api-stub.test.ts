import { describe, expect, it } from "vitest";
import {
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "./benchmark-api-stub";

describe("createBenchmarkApiStub", () => {
  it("routes by method and path and extracts path parameters and the query", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("GET", "/v1/benchmarks/runs/:runId", ({ params, query }) =>
      json({ runId: params.runId, limit: query.get("limit") }),
    );

    const response = await stub.fetch(
      new Request("http://api.test/v1/benchmarks/runs/run-1?limit=5"),
    );

    expect(await response.json()).toEqual({ runId: "run-1", limit: "5" });
  });

  it("decodes path parameters", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("GET", "/v1/benchmarks/runs/:runId", ({ params }) =>
      json({ runId: params.runId }),
    );

    const response = await stub.fetch(
      new Request("http://api.test/v1/benchmarks/runs/a%2Fb"),
    );

    expect(await response.json()).toEqual({ runId: "a/b" });
  });

  it("records every request with its method, path, query, headers, and parsed body", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("PUT", "/v1/benchmarks/baseline", () => json({ ok: true }));

    await stub.fetch(
      new Request("http://api.test/v1/benchmarks/baseline?x=1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1" }),
      }),
    );

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/benchmarks/baseline",
      body: { runId: "run-1" },
    });
    expect(stub.requests[0].query.get("x")).toBe("1");
    expect(stub.requests[0].headers.get("content-type")).toBe(
      "application/json",
    );
  });

  it("does not match another method or another path, and reports the unmatched request loudly", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("GET", "/v1/benchmarks/status", () => json({ enabled: true }));

    const response = await stub.fetch(
      new Request("http://api.test/v1/benchmarks/status", { method: "PUT" }),
    );

    expect(response.status).toBe(501);
    expect(stub.unmatched).toEqual(["PUT /v1/benchmarks/status"]);
  });

  it("can simulate an unreachable API", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("GET", "/v1/benchmarks/status", networkFailure());

    await expect(
      stub.fetch(new Request("http://api.test/v1/benchmarks/status")),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("lets a later route replace an earlier one for the same method and path", async () => {
    const stub = createBenchmarkApiStub();
    stub.on("GET", "/v1/benchmarks/status", () => json({ n: 1 }));
    stub.on("GET", "/v1/benchmarks/status", () => json({ n: 2 }));

    const response = await stub.fetch(
      new Request("http://api.test/v1/benchmarks/status"),
    );

    expect(await response.json()).toEqual({ n: 2 });
  });
});
