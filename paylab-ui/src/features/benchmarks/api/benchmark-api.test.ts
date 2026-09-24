import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BenchmarkApiStub,
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "@/test/benchmark-api-stub";
import {
  artifact,
  artifactContent,
  baselineSelection,
  baselineView,
  benchmarkStatus,
  capabilityOffBody,
  comparison,
  notFoundBody,
  runDetail,
  runPage,
  runProgress,
  trend,
  validationBody,
} from "@/test/benchmark-fixtures";
import {
  artifactDownloadUrl,
  fetchArtifact,
  fetchArtifactContent,
  fetchBaseline,
  fetchBenchmarkStatus,
  fetchComparison,
  fetchDefaultComparison,
  fetchRun,
  fetchRunProgress,
  fetchRuns,
  fetchTrend,
  selectBaseline,
} from "./benchmark-api";

const BASE = "http://localhost:3333";

describe("the benchmark API calls", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    stub = createBenchmarkApiStub().install();
  });
  afterEach(() => {
    expect(stub.unmatched).toEqual([]);
    vi.unstubAllGlobals();
  });

  describe("results", () => {
    it("returns the typed data of a successful read", async () => {
      stub.on("GET", "/v1/benchmarks/status", () => json(benchmarkStatus()));

      const result = await fetchBenchmarkStatus();

      expect(result).toEqual({ ok: true, data: benchmarkStatus() });
    });

    it("reads every route into its typed shape", async () => {
      stub.on("GET", "/v1/benchmarks/runs", () => json(runPage()));
      stub.on("GET", "/v1/benchmarks/runs/:runId", () => json(runDetail()));
      stub.on("GET", "/v1/benchmarks/runs/:runId/progress", () =>
        json(runProgress()),
      );
      stub.on("GET", "/v1/benchmarks/runs/:runId/artifacts/:artifactId", () =>
        json(artifact()),
      );
      stub.on(
        "GET",
        "/v1/benchmarks/runs/:runId/artifacts/:artifactId/content",
        () => json(artifactContent()),
      );
      stub.on("GET", "/v1/benchmarks/comparisons/default", () =>
        json(comparison()),
      );
      stub.on("GET", "/v1/benchmarks/comparisons", () => json(comparison()));
      stub.on("GET", "/v1/benchmarks/trends", () => json(trend()));
      stub.on("GET", "/v1/benchmarks/baseline", () => json(baselineView()));

      const results = await Promise.all([
        fetchRuns(),
        fetchRun("r1"),
        fetchRunProgress("r1"),
        fetchArtifact("r1", "a1"),
        fetchArtifactContent("r1", "a1"),
        fetchDefaultComparison(),
        fetchComparison({ current: "r2", reference: "r1" }),
        fetchTrend({ scenarioId: "s", metric: "tps" }),
        fetchBaseline(),
      ]);

      expect(results.every((result) => result.ok)).toBe(true);
    });
  });

  describe("the failure taxonomy", () => {
    const failureOf = async <T>(
      call: Promise<{ ok: boolean; failure?: unknown; data?: T }>,
    ) => {
      const result = await call;
      if (result.ok) throw new Error("expected a failure");
      return result.failure;
    };

    it("treats a 404 without an error code as the capability being off", async () => {
      stub.on("GET", "/v1/benchmarks/status", () =>
        json(capabilityOffBody(), 404),
      );

      expect(await failureOf(fetchBenchmarkStatus())).toEqual({
        kind: "unavailable",
      });
    });

    it("treats a 404 whose body is not JSON at all (the router's answer) as the capability being off", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs",
        () => new Response("Cannot GET /v1/benchmarks/runs", { status: 404 }),
      );

      expect(await failureOf(fetchRuns())).toEqual({ kind: "unavailable" });
    });

    it("treats a 404 with BENCHMARK_RUN_NOT_FOUND or BENCHMARK_ARTIFACT_NOT_FOUND as not found", async () => {
      stub.on("GET", "/v1/benchmarks/runs/:runId", () =>
        json(notFoundBody("BENCHMARK_RUN_NOT_FOUND", "No such Run."), 404),
      );
      stub.on("GET", "/v1/benchmarks/runs/:runId/artifacts/:artifactId", () =>
        json(
          notFoundBody("BENCHMARK_ARTIFACT_NOT_FOUND", "No such Artifact."),
          404,
        ),
      );

      expect(await failureOf(fetchRun("r1"))).toMatchObject({
        kind: "not-found",
        code: "BENCHMARK_RUN_NOT_FOUND",
        message: "No such Run.",
      });
      expect(await failureOf(fetchArtifact("r1", "a"))).toMatchObject({
        kind: "not-found",
        code: "BENCHMARK_ARTIFACT_NOT_FOUND",
      });
    });

    it("treats BENCHMARK_ARTIFACT_UNAVAILABLE as a listed Artifact whose file is not on this machine", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs/:runId/artifacts/:artifactId/content",
        () =>
          json(notFoundBody("BENCHMARK_ARTIFACT_UNAVAILABLE", "Gone."), 404),
      );

      expect(await failureOf(fetchArtifactContent("r1", "a"))).toMatchObject({
        kind: "artifact-unavailable",
        message: "Gone.",
      });
    });

    it("keeps the code of every refusal the API can give", async () => {
      stub.on("GET", "/v1/benchmarks/comparisons", () =>
        json(
          validationBody(
            "BENCHMARK_RUN_NOT_COMPARABLE",
            "Run x is INCOMPLETE.",
          ),
          422,
        ),
      );
      stub.on("PUT", "/v1/benchmarks/baseline", () =>
        json(
          validationBody("BENCHMARK_BASELINE_INELIGIBLE", "Not completed."),
          422,
        ),
      );
      stub.on("GET", "/v1/benchmarks/runs", () =>
        json(validationBody("VALIDATION_ERROR", "Invalid request."), 422),
      );

      expect(
        await failureOf(fetchComparison({ current: "x", reference: "y" })),
      ).toMatchObject({
        kind: "refused",
        code: "BENCHMARK_RUN_NOT_COMPARABLE",
      });
      expect(await failureOf(selectBaseline("x"))).toMatchObject({
        kind: "refused",
        code: "BENCHMARK_BASELINE_INELIGIBLE",
        message: "Not completed.",
      });
      expect(await failureOf(fetchRuns({ limit: 0 }))).toMatchObject({
        kind: "refused",
        code: "VALIDATION_ERROR",
      });
    });

    it("reports an API that cannot be reached", async () => {
      stub.on("GET", "/v1/benchmarks/status", networkFailure());

      expect(await failureOf(fetchBenchmarkStatus())).toMatchObject({
        kind: "unreachable",
      });
    });

    it("reports an answer that is not JSON, or does not have the expected shape, as malformed", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/status",
        () => new Response("<html>oops</html>", { status: 200 }),
      );
      stub.on("GET", "/v1/benchmarks/runs", () => json({ unexpected: true }));
      stub.on("GET", "/v1/benchmarks/runs/:runId", () =>
        json(["not", "a run"]),
      );

      expect(await failureOf(fetchBenchmarkStatus())).toMatchObject({
        kind: "malformed",
      });
      expect(await failureOf(fetchRuns())).toMatchObject({ kind: "malformed" });
      expect(await failureOf(fetchRun("r1"))).toMatchObject({
        kind: "malformed",
      });
    });

    it("reports any other HTTP error with its status", async () => {
      stub.on("GET", "/v1/benchmarks/runs", () =>
        json({ message: "boom" }, 500),
      );

      expect(await failureOf(fetchRuns())).toMatchObject({
        kind: "http",
        status: 500,
      });
    });
  });

  describe("the requests", () => {
    it("send no credential and use the configured API base URL", async () => {
      stub.on("GET", "/v1/benchmarks/status", () => json(benchmarkStatus()));

      await fetchBenchmarkStatus();
      await fetchBenchmarkStatus({ baseUrl: "http://other.test:4000/" });

      expect(stub.requests[0].url).toBe(`${BASE}/v1/benchmarks/status`);
      expect(stub.requests[1].url).toBe(
        "http://other.test:4000/v1/benchmarks/status",
      );
      for (const request of stub.requests) {
        expect(request.headers.get("authorization")).toBeNull();
        expect(request.headers.get("accept")).toContain("application/json");
      }
    });

    it("send the list parameters exactly as given", async () => {
      stub.on("GET", "/v1/benchmarks/runs", () => json(runPage()));

      await fetchRuns({ limit: 10, cursor: "abc_-", status: "COMPLETED" });
      await fetchRuns();

      expect(stub.requests[0].query.get("limit")).toBe("10");
      expect(stub.requests[0].query.get("cursor")).toBe("abc_-");
      expect(stub.requests[0].query.get("status")).toBe("COMPLETED");
      expect([...stub.requests[1].query.keys()]).toEqual([]);
    });

    it("encode identifiers in the path", async () => {
      stub.on("GET", "/v1/benchmarks/runs/:runId", () => json(runDetail()));

      await fetchRun("a/b c");

      expect(stub.requests[0].path).toBe("/v1/benchmarks/runs/a%2Fb%20c");
    });

    it("send the Artifact offset and limit, and the two Runs of a comparison", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs/:runId/artifacts/:artifactId/content",
        () => json(artifactContent()),
      );
      stub.on("GET", "/v1/benchmarks/comparisons", () => json(comparison()));

      await fetchArtifactContent("r1", "a1", { offset: 4096, limit: 1024 });
      await fetchComparison({ current: "new", reference: "old" });

      expect(stub.requests[0].query.get("offset")).toBe("4096");
      expect(stub.requests[0].query.get("limit")).toBe("1024");
      expect(stub.requests[1].query.get("current")).toBe("new");
      expect(stub.requests[1].query.get("reference")).toBe("old");
    });

    it("repeat the dimension parameter, in order, for a trend", async () => {
      stub.on("GET", "/v1/benchmarks/trends", () => json(trend()));

      await fetchTrend({
        scenarioId: "t14.load.H.c4.sync-on",
        metric: "tps",
        dimensions: { strategy: "nokey", sync: "on" },
      });

      const { query } = stub.requests[0];
      expect(query.get("scenarioId")).toBe("t14.load.H.c4.sync-on");
      expect(query.get("metric")).toBe("tps");
      expect(query.getAll("dimension")).toEqual(["strategy:nokey", "sync:on"]);
    });

    it("select a Baseline with a JSON body that carries only the Run id", async () => {
      stub.on("PUT", "/v1/benchmarks/baseline", () =>
        json(baselineSelection()),
      );

      const result = await selectBaseline("run-1");

      expect(result.ok).toBe(true);
      expect(stub.requests[0].method).toBe("PUT");
      expect(stub.requests[0].body).toEqual({ runId: "run-1" });
      expect(stub.requests[0].headers.get("content-type")).toContain(
        "application/json",
      );
      expect(stub.requests[0].headers.get("authorization")).toBeNull();
    });

    it("build the Artifact download link on the configured base URL", () => {
      expect(artifactDownloadUrl("run 1", "a/1")).toBe(
        `${BASE}/v1/benchmarks/runs/run%201/artifacts/a%2F1/download`,
      );
      expect(artifactDownloadUrl("r", "a", "http://x.test/")).toBe(
        "http://x.test/v1/benchmarks/runs/r/artifacts/a/download",
      );
    });
  });
});
