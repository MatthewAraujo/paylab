"use client";

import { useQuery } from "@tanstack/react-query";
import {
  type Comparison,
  fetchComparison,
  fetchDefaultComparison,
  fetchRun,
  fetchRuns,
} from "../api/benchmark-api";
import { useComparison } from "../api/hooks";
import { shouldRetry } from "../api/policy";
import { benchmarkKeys } from "../api/query-keys";
import { unwrap } from "../api/results";

/** How many earlier Runs are asked about before giving up on a previous compatible one. */
export const PREVIOUS_CANDIDATES = 10;

type Selection = { current?: string; reference?: string; baseUrl?: string };

/**
 * The comparison the address asks for. Both Runs: exactly that pair. Neither: the API's default.
 * Only the current Run (the shortcut from a Run detail): the most recent earlier completed Run
 * that has at least one comparable scenario with it, asked of the API newest first.
 */
export function useComparisonData({ current, reference, baseUrl }: Selection) {
  const mode = current && reference ? "pair" : current ? "previous" : "default";

  const pair = useComparison(
    mode === "pair" ? current : undefined,
    mode === "pair" ? reference : undefined,
    { baseUrl },
  );

  const fallback = useQuery({
    queryKey: benchmarkKeys.defaultComparison(baseUrl),
    queryFn: async ({ signal }) =>
      unwrap(await fetchDefaultComparison({ signal, baseUrl })),
    enabled: mode === "default",
    retry: shouldRetry,
  });

  const previous = useQuery({
    queryKey: [
      ...benchmarkKeys.all(baseUrl),
      "comparison",
      "previous-compatible",
      current ?? "",
    ],
    queryFn: async ({ signal }): Promise<Comparison> => {
      const options = { signal, baseUrl };
      const run = unwrap(await fetchRun(current as string, options));
      const page = unwrap(await fetchRuns({ limit: 50 }, options));
      const candidates = page.items
        .filter(
          (item) =>
            item.status === "COMPLETED" &&
            item.runId !== run.runId &&
            item.startedAt < run.startedAt,
        )
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
        .slice(0, PREVIOUS_CANDIDATES);

      let asked: Comparison | undefined;
      for (const candidate of candidates) {
        const result = unwrap(
          await fetchComparison(
            { current: run.runId, reference: candidate.runId },
            options,
          ),
        );
        asked ??= result;
        if (
          result.comparison?.scenarios.some((s) => s.state === "comparable")
        ) {
          return result;
        }
      }
      return {
        current:
          asked?.current ??
          page.items.find((item) => item.runId === run.runId) ??
          null,
        reference: null,
        comparison: null,
      };
    },
    enabled: mode === "previous",
    retry: shouldRetry,
  });

  const query =
    mode === "pair" ? pair : mode === "previous" ? previous : fallback;
  return { mode, query };
}
