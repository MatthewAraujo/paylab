import type { RunListParams, TrendParams } from "./benchmark-api";

/**
 * One key family for every benchmark read. The API base URL is part of the key so data read from
 * one API is never shown as if it came from another.
 */
export const benchmarkKeys = {
  all: (baseUrl?: string) => ["benchmarks", baseUrl ?? "default"] as const,
  status: (baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "status"] as const,
  runs: (params: RunListParams, baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "runs", params] as const,
  run: (runId: string, baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "run", runId] as const,
  progress: (runId: string, baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "progress", runId] as const,
  artifact: (runId: string, artifactId: string, baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "artifact", runId, artifactId] as const,
  artifactContent: (
    runId: string,
    artifactId: string,
    offset: number,
    limit: number | undefined,
    baseUrl?: string,
  ) =>
    [
      ...benchmarkKeys.all(baseUrl),
      "artifact-content",
      runId,
      artifactId,
      offset,
      limit ?? null,
    ] as const,
  defaultComparison: (baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "comparison", "default"] as const,
  comparison: (current: string, reference: string, baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "comparison", current, reference] as const,
  trends: (baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "trend"] as const,
  trend: (params: TrendParams, baseUrl?: string) =>
    [...benchmarkKeys.trends(baseUrl), params] as const,
  baseline: (baseUrl?: string) =>
    [...benchmarkKeys.all(baseUrl), "baseline"] as const,
};
