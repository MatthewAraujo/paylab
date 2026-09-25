"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchArtifactContent } from "../api/benchmark-api";
import { shouldRetry } from "../api/policy";
import { benchmarkKeys } from "../api/query-keys";
import { unwrap } from "../api/results";

/** Bytes requested per chunk; the API accepts up to 256 KiB and always cuts on whole lines. */
export const ARTIFACT_CHUNK_BYTES = 64 * 1024;

type Options = { runId: string; artifactId: string; baseUrl?: string };

/**
 * Reads an Artifact as text, one bounded chunk at a time. More text is fetched only when the
 * caller asks (`fetchNextPage`), following the `nextOffset` the API returns.
 */
export function useArtifactText({ runId, artifactId, baseUrl }: Options) {
  return useInfiniteQuery({
    queryKey: [
      ...benchmarkKeys.artifact(runId, artifactId, baseUrl),
      "text",
      ARTIFACT_CHUNK_BYTES,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await fetchArtifactContent(
          runId,
          artifactId,
          { offset: pageParam, limit: ARTIFACT_CHUNK_BYTES },
          { signal, baseUrl },
        ),
      ),
    getNextPageParam: (chunk) => chunk.nextOffset ?? undefined,
    retry: shouldRetry,
  });
}
