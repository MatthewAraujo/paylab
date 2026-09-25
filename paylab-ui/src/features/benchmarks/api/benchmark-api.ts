import createClient from "openapi-fetch";
import type { components, paths } from "@/api/generated/schema";
import { getApiBaseUrl } from "@/lib/env";
import type { BenchmarkFailure, BenchmarkResult } from "./results";

// The benchmark surface is a local, unauthenticated, non-financial API read from the browser
// (like System Health). This client carries no credential: never the Merchant key, never
// `createServerApiClient`.

type Schemas = components["schemas"];

export type BenchmarkStatus = Schemas["BenchmarkStatusResponse"];
export type RunPage = Schemas["RunPageResponse"];
export type RunDetail = Schemas["RunDetailResponse"];
export type RunProgress = Schemas["RunProgressResponse"];
export type ArtifactMetadata = Schemas["ArtifactResponse"];
export type ArtifactChunk = Schemas["ArtifactContentResponse"];
export type Comparison = Schemas["ComparisonResponse"];
export type Trend = Schemas["TrendResponse"];
export type BaselineView = Schemas["BaselineResponse"];
export type BaselineSelection = Schemas["BaselineSelectionResponse"];
export type RunStatus = RunPage["items"][number]["status"];

export type CallOptions = {
  signal?: AbortSignal;
  /** Defaults to the configured `NEXT_PUBLIC_PAYLAB_API_URL`. */
  baseUrl?: string;
};

const stripSlash = (url: string) => url.replace(/\/+$/, "");

function client(options: CallOptions) {
  return createClient<paths>({
    baseUrl: stripSlash(options.baseUrl ?? getApiBaseUrl()),
    headers: { Accept: "application/json" },
    cache: "no-store",
    // Resolved on every request, so a replaced global `fetch` (tests) is honoured.
    fetch: (request) => globalThis.fetch(request),
  });
}

type Outcome<T> = { data?: T; error?: unknown; response: Response };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function failureFromHttp(response: Response, error: unknown): BenchmarkFailure {
  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : undefined;
  const message = messageOf(error, `HTTP ${response.status}`);

  if (response.status === 404) {
    if (!code) return { kind: "unavailable" };
    if (code === "BENCHMARK_ARTIFACT_UNAVAILABLE") {
      return { kind: "artifact-unavailable", message };
    }
    return { kind: "not-found", code, message };
  }
  if (response.status === 422) {
    return { kind: "refused", code: code ?? "VALIDATION_ERROR", message };
  }
  return { kind: "http", status: response.status, message };
}

async function call<T>(
  request: () => Promise<Outcome<T>>,
  hasExpectedShape: (data: unknown) => boolean,
): Promise<BenchmarkResult<T>> {
  let outcome: Outcome<T>;
  try {
    outcome = await request();
  } catch (error) {
    // A cancelled query is not a failure of the API: let it propagate.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        failure: {
          kind: "malformed",
          message: "The API answered with something that is not JSON.",
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: "unreachable",
        message:
          error instanceof Error ? error.message : "The API is not reachable.",
      },
    };
  }

  const { data, error, response } = outcome;
  if (!response.ok) {
    return { ok: false, failure: failureFromHttp(response, error) };
  }
  if (data === undefined || !hasExpectedShape(data)) {
    return {
      ok: false,
      failure: {
        kind: "malformed",
        message: "The API answer does not match the expected contract.",
      },
    };
  }
  return { ok: true, data };
}

const hasArray = (key: string) => (data: unknown) =>
  isRecord(data) && Array.isArray(data[key]);
const hasString = (key: string) => (data: unknown) =>
  isRecord(data) && typeof data[key] === "string";
const hasKeys =
  (...keys: string[]) =>
  (data: unknown) =>
    isRecord(data) && keys.every((key) => key in data);

export function fetchBenchmarkStatus(options: CallOptions = {}) {
  return call<BenchmarkStatus>(
    () =>
      client(options).GET("/v1/benchmarks/status", { signal: options.signal }),
    (data) => isRecord(data) && typeof data.enabled === "boolean",
  );
}

export type RunListParams = {
  limit?: number;
  cursor?: string;
  status?: RunStatus;
};

export function fetchRuns(
  params: RunListParams = {},
  options: CallOptions = {},
) {
  return call<RunPage>(
    () =>
      client(options).GET("/v1/benchmarks/runs", {
        params: { query: params },
        signal: options.signal,
      }),
    hasArray("items"),
  );
}

export function fetchRun(runId: string, options: CallOptions = {}) {
  return call<RunDetail>(
    () =>
      client(options).GET("/v1/benchmarks/runs/{runId}", {
        params: { path: { runId } },
        signal: options.signal,
      }),
    (data) => hasString("runId")(data) && hasArray("scenarios")(data),
  );
}

export function fetchRunProgress(runId: string, options: CallOptions = {}) {
  return call<RunProgress>(
    () =>
      client(options).GET("/v1/benchmarks/runs/{runId}/progress", {
        params: { path: { runId } },
        signal: options.signal,
      }),
    (data) => hasString("runId")(data) && hasArray("scenarios")(data),
  );
}

export function fetchArtifact(
  runId: string,
  artifactId: string,
  options: CallOptions = {},
) {
  return call<ArtifactMetadata>(
    () =>
      client(options).GET(
        "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}",
        { params: { path: { runId, artifactId } }, signal: options.signal },
      ),
    hasString("id"),
  );
}

export type ArtifactRange = { offset?: number; limit?: number };

export function fetchArtifactContent(
  runId: string,
  artifactId: string,
  range: ArtifactRange = {},
  options: CallOptions = {},
) {
  return call<ArtifactChunk>(
    () =>
      client(options).GET(
        "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content",
        {
          params: { path: { runId, artifactId }, query: range },
          signal: options.signal,
        },
      ),
    hasString("content"),
  );
}

/** The link to download the complete sanitized file: a plain link, not a typed read. */
export function artifactDownloadUrl(
  runId: string,
  artifactId: string,
  baseUrl?: string,
): string {
  return `${stripSlash(baseUrl ?? getApiBaseUrl())}/v1/benchmarks/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
}

export function fetchDefaultComparison(options: CallOptions = {}) {
  return call<Comparison>(
    () =>
      client(options).GET("/v1/benchmarks/comparisons/default", {
        signal: options.signal,
      }),
    hasKeys("current", "reference", "comparison"),
  );
}

export function fetchComparison(
  runs: { current: string; reference: string },
  options: CallOptions = {},
) {
  return call<Comparison>(
    () =>
      client(options).GET("/v1/benchmarks/comparisons", {
        params: { query: runs },
        signal: options.signal,
      }),
    hasKeys("current", "reference", "comparison"),
  );
}

export type TrendParams = {
  scenarioId: string;
  metric: string;
  /** Selects one series of a scenario, e.g. `{ strategy: "nokey" }`. */
  dimensions?: Record<string, string>;
};

export function fetchTrend(params: TrendParams, options: CallOptions = {}) {
  const dimension = Object.entries(params.dimensions ?? {}).map(
    ([key, value]) => `${key}:${value}`,
  );
  return call<Trend>(
    () =>
      client(options).GET("/v1/benchmarks/trends", {
        params: {
          query: {
            scenarioId: params.scenarioId,
            metric: params.metric,
            ...(dimension.length > 0 ? { dimension } : {}),
          },
        },
        signal: options.signal,
      }),
    hasArray("points"),
  );
}

export function fetchBaseline(options: CallOptions = {}) {
  return call<BaselineView>(
    () =>
      client(options).GET("/v1/benchmarks/baseline", {
        signal: options.signal,
      }),
    hasKeys("baseline", "git"),
  );
}

/** The console's one write: point the Baseline at a completed Run. The body is only the Run id. */
export function selectBaseline(runId: string, options: CallOptions = {}) {
  return call<BaselineSelection>(
    () =>
      client(options).PUT("/v1/benchmarks/baseline", {
        body: { runId },
        signal: options.signal,
      }),
    (data) =>
      hasKeys("baseline", "git")(data) &&
      isRecord(data) &&
      typeof data.changed === "boolean",
  );
}
