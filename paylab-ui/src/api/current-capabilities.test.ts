import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import snapshot from "../../openapi/paylab.json";
import { currentCapabilities } from "./current-capabilities";

const BENCHMARK_PATHS = [
  "/v1/benchmarks/status",
  "/v1/benchmarks/runs",
  "/v1/benchmarks/runs/{runId}",
  "/v1/benchmarks/runs/{runId}/progress",
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}",
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content",
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/download",
  "/v1/benchmarks/comparisons/default",
  "/v1/benchmarks/comparisons",
  "/v1/benchmarks/trends",
  "/v1/benchmarks/baseline",
];

// A stale snapshot or generated schema would silently hide the Benchmarks area or type it wrongly.
describe("the committed contract", () => {
  it("describes every benchmark route the console uses", () => {
    const documented = Object.keys(snapshot.paths);

    for (const path of BENCHMARK_PATHS) {
      expect(documented, path).toContain(path);
    }
  });

  it("derives the Benchmarks capability, and the Baseline write, from the snapshot", () => {
    expect(currentCapabilities.benchmarks).toBe(true);
    expect(currentCapabilities.benchmarkBaselineWrite).toBe(true);
  });

  it("generates types for the benchmark routes and their key responses", () => {
    const generated = readFileSync(
      join(process.cwd(), "src/api/generated/schema.d.ts"),
      "utf8",
    );

    for (const path of BENCHMARK_PATHS) {
      expect(generated, path).toContain(`"${path}"`);
    }
    for (const schema of [
      "RunPageResponse",
      "RunDetailResponse",
      "RunProgressResponse",
      "ComparisonResponse",
      "TrendResponse",
      "BaselineResponse",
      "BaselineSelectionResponse",
      "ArtifactContentResponse",
    ]) {
      expect(generated, schema).toContain(`${schema}:`);
    }
  });
});
