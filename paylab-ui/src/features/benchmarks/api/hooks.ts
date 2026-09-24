"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type ArtifactRange,
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
  type RunListParams,
  selectBaseline,
  type TrendParams,
} from "./benchmark-api";
import {
  PROGRESS_POLL_MS,
  progressRefetchInterval,
  shouldRetry,
} from "./policy";
import { benchmarkKeys } from "./query-keys";
import { unwrap } from "./results";

/** Every hook reads from the configured API unless a `baseUrl` is given (tests, previews). */
export type HookOptions = { baseUrl?: string };

export function useBenchmarkStatus({ baseUrl }: HookOptions = {}) {
  return useQuery({
    queryKey: benchmarkKeys.status(baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchBenchmarkStatus({ signal, baseUrl })),
    retry: shouldRetry,
  });
}

export function useRuns(
  params: Omit<RunListParams, "cursor"> = {},
  { baseUrl }: HookOptions = {},
) {
  return useInfiniteQuery({
    queryKey: benchmarkKeys.runs(params, baseUrl),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await fetchRuns({ ...params, cursor: pageParam }, { signal, baseUrl }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: shouldRetry,
  });
}

export function useRun(runId: string, { baseUrl }: HookOptions = {}) {
  return useQuery({
    queryKey: benchmarkKeys.run(runId, baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchRun(runId, { signal, baseUrl })),
    retry: shouldRetry,
  });
}

/** Polls only while the Run is running and its owner process is alive. */
export function useRunProgress(
  runId: string,
  {
    baseUrl,
    pollMs = PROGRESS_POLL_MS,
  }: HookOptions & { pollMs?: number } = {},
) {
  return useQuery({
    queryKey: benchmarkKeys.progress(runId, baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchRunProgress(runId, { signal, baseUrl })),
    refetchInterval: (query) =>
      progressRefetchInterval(query.state.data, pollMs),
    retry: shouldRetry,
  });
}

export function useArtifact(
  runId: string,
  artifactId: string,
  { baseUrl }: HookOptions = {},
) {
  return useQuery({
    queryKey: benchmarkKeys.artifact(runId, artifactId, baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchArtifact(runId, artifactId, { signal, baseUrl })),
    retry: shouldRetry,
  });
}

export function useArtifactContent(
  runId: string,
  artifactId: string,
  range: ArtifactRange = {},
  { baseUrl, enabled = true }: HookOptions & { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: benchmarkKeys.artifactContent(
      runId,
      artifactId,
      range.offset ?? 0,
      range.limit,
      baseUrl,
    ),
    queryFn: async ({ signal }) =>
      unwrap(
        await fetchArtifactContent(runId, artifactId, range, {
          signal,
          baseUrl,
        }),
      ),
    enabled,
    retry: shouldRetry,
  });
}

export function useDefaultComparison({ baseUrl }: HookOptions = {}) {
  return useQuery({
    queryKey: benchmarkKeys.defaultComparison(baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchDefaultComparison({ signal, baseUrl })),
    retry: shouldRetry,
  });
}

/** Waits until both Runs are chosen. */
export function useComparison(
  current: string | undefined,
  reference: string | undefined,
  { baseUrl }: HookOptions = {},
) {
  return useQuery({
    queryKey: benchmarkKeys.comparison(current ?? "", reference ?? "", baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(
        await fetchComparison(
          { current: current as string, reference: reference as string },
          { signal, baseUrl },
        ),
      ),
    enabled: Boolean(current && reference),
    retry: shouldRetry,
  });
}

export function useTrend(
  params: TrendParams,
  { baseUrl, enabled = true }: HookOptions & { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: benchmarkKeys.trend(params, baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchTrend(params, { signal, baseUrl })),
    enabled,
    retry: shouldRetry,
  });
}

export function useBaseline({ baseUrl }: HookOptions = {}) {
  return useQuery({
    queryKey: benchmarkKeys.baseline(baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchBaseline({ signal, baseUrl })),
    retry: shouldRetry,
  });
}

/**
 * The console's one write. A selection changes what the default comparison and the trends are
 * measured against, so once it succeeds every Baseline-dependent read is re-read.
 */
export function useSelectBaseline({ baseUrl }: HookOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) =>
      unwrap(await selectBaseline(runId, { baseUrl })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: benchmarkKeys.baseline(baseUrl),
        }),
        queryClient.invalidateQueries({
          queryKey: benchmarkKeys.defaultComparison(baseUrl),
        }),
        queryClient.invalidateQueries({
          queryKey: benchmarkKeys.trends(baseUrl),
        }),
      ]);
    },
  });
}
