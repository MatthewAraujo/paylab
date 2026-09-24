import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BenchmarkApiStub,
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "@/test/benchmark-api-stub";
import {
  baselineSelection,
  baselineView,
  benchmarkStatus,
  capabilityOffBody,
  comparison,
  runDetail,
  runListItem,
  runPage,
  runProgress,
  trend,
  validationBody,
} from "@/test/benchmark-fixtures";
import {
  useBaseline,
  useBenchmarkStatus,
  useComparison,
  useRun,
  useRunProgress,
  useRuns,
  useSelectBaseline,
  useTrend,
} from "./hooks";
import { BenchmarkRequestError } from "./results";

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("the benchmark hooks", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    stub = createBenchmarkApiStub().install();
  });
  afterEach(() => {
    expect(stub.unmatched).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("load a Run and expose it once read", async () => {
    stub.on("GET", "/v1/benchmarks/runs/:runId", () => json(runDetail()));
    const { wrapper } = setup();

    const { result } = renderHook(() => useRun("run-1"), { wrapper });

    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.runId).toBe(runDetail().runId);
    expect(stub.requests[0].path).toBe("/v1/benchmarks/runs/run-1");
  });

  it("report a disabled capability as such, at once, without retrying", async () => {
    stub.on("GET", "/v1/benchmarks/status", () =>
      json(capabilityOffBody(), 404),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useBenchmarkStatus(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BenchmarkRequestError);
    expect((result.current.error as BenchmarkRequestError).failure).toEqual({
      kind: "unavailable",
    });
    expect(stub.requests).toHaveLength(1);
  });

  it("retry an unreachable API once, and then report it", async () => {
    stub.on("GET", "/v1/benchmarks/status", networkFailure());
    const { wrapper } = setup();

    const { result } = renderHook(() => useBenchmarkStatus(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(stub.requests).toHaveLength(2);
    expect((result.current.error as BenchmarkRequestError).failure.kind).toBe(
      "unreachable",
    );
  });

  it("recover when the retry succeeds", async () => {
    let calls = 0;
    stub.on("GET", "/v1/benchmarks/status", () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return json(benchmarkStatus());
    });
    const { wrapper } = setup();

    const { result } = renderHook(() => useBenchmarkStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.enabled).toBe(true);
  });

  it("keep the previous data visible when only a refresh fails", async () => {
    stub.on("GET", "/v1/benchmarks/runs/:runId", () => json(runDetail()));
    const { wrapper } = setup();
    const { result } = renderHook(() => useRun("run-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    stub.on("GET", "/v1/benchmarks/runs/:runId", networkFailure());
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isRefetchError).toBe(true));
    expect(result.current.data?.runId).toBe(runDetail().runId);
    expect(result.current.error).toBeInstanceOf(BenchmarkRequestError);
  });

  it("page through the Runs with the cursor the API gave", async () => {
    stub.on("GET", "/v1/benchmarks/runs", ({ query }) =>
      query.get("cursor") === "c2"
        ? json(runPage({ items: [runListItem({ runId: "old" })] }))
        : json(
            runPage({
              items: [runListItem({ runId: "new" })],
              nextCursor: "c2",
            }),
          ),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useRuns({ limit: 1 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(
      result.current.data?.pages.flatMap((page) =>
        page.items.map((item) => item.runId),
      ),
    ).toEqual(["new", "old"]);
    expect(stub.requests[0].query.get("limit")).toBe("1");
    expect(stub.requests[1].query.get("cursor")).toBe("c2");
  });

  it("do not ask for a comparison until both Runs are chosen", async () => {
    stub.on("GET", "/v1/benchmarks/comparisons", () => json(comparison()));
    const { wrapper } = setup();

    const { result, rerender } = renderHook(
      ({ reference }: { reference?: string }) =>
        useComparison("current-run", reference),
      {
        wrapper,
        initialProps: { reference: undefined } as { reference?: string },
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(stub.requests).toHaveLength(0);

    rerender({ reference: "reference-run" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(stub.requests[0].query.get("reference")).toBe("reference-run");
  });

  it("request the trend of one metric and dimension", async () => {
    stub.on("GET", "/v1/benchmarks/trends", () => json(trend()));
    const { wrapper } = setup();

    const { result } = renderHook(
      () =>
        useTrend({
          scenarioId: "t14.load.M.c64.sync-on",
          metric: "tps",
          dimensions: { strategy: "nokey" },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(stub.requests[0].query.getAll("dimension")).toEqual([
      "strategy:nokey",
    ]);
  });

  describe("selecting the Baseline", () => {
    it("re-reads the Baseline everywhere it is shown", async () => {
      let selected = false;
      stub.on("GET", "/v1/benchmarks/baseline", () =>
        json(selected ? baselineSelection() : baselineView()),
      );
      stub.on("PUT", "/v1/benchmarks/baseline", () => {
        selected = true;
        return json(baselineSelection());
      });
      const { wrapper } = setup();
      const { result } = renderHook(
        () => ({ baseline: useBaseline(), select: useSelectBaseline() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.baseline.isSuccess).toBe(true));
      expect(result.current.baseline.data?.baseline).toBeNull();

      await act(async () => {
        await result.current.select.mutateAsync("run-1");
      });

      await waitFor(() =>
        expect(result.current.baseline.data?.baseline?.runId).toBe(
          baselineSelection().baseline?.runId,
        ),
      );
      expect(stub.requests.find((r) => r.method === "PUT")?.body).toEqual({
        runId: "run-1",
      });
    });

    it("surfaces the refusal and leaves the Baseline as it was", async () => {
      stub.on("GET", "/v1/benchmarks/baseline", () =>
        json(baselineSelection({ changed: false })),
      );
      stub.on("PUT", "/v1/benchmarks/baseline", () =>
        json(
          validationBody("BENCHMARK_BASELINE_INELIGIBLE", "Run is INCOMPLETE."),
          422,
        ),
      );
      const { wrapper } = setup();
      const { result } = renderHook(
        () => ({ baseline: useBaseline(), select: useSelectBaseline() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.baseline.isSuccess).toBe(true));
      const before = result.current.baseline.data;

      await act(async () => {
        await result.current.select.mutateAsync("run-x").catch(() => {});
      });

      await waitFor(() => expect(result.current.select.isError).toBe(true));
      const error = result.current.select.error as BenchmarkRequestError;
      expect(error.failure).toMatchObject({
        kind: "refused",
        code: "BENCHMARK_BASELINE_INELIGIBLE",
      });
      expect(result.current.baseline.data).toEqual(before);
    });
  });

  describe("following the progress of a Run", () => {
    it("polls while the Run is running and stops once it is terminal", async () => {
      let calls = 0;
      stub.on("GET", "/v1/benchmarks/runs/:runId/progress", () => {
        calls += 1;
        return json(
          calls < 3
            ? runProgress({ completed: calls })
            : runProgress({ status: "COMPLETED", current: null }),
        );
      });
      const { wrapper } = setup();

      const { result } = renderHook(
        () => useRunProgress("live-1", { pollMs: 20 }),
        { wrapper },
      );

      await waitFor(() =>
        expect(result.current.data?.status).toBe("COMPLETED"),
      );
      const settled = stub.requests.length;
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(stub.requests.length).toBe(settled);
      expect(settled).toBe(3);
    });

    it("does not poll an abandoned record", async () => {
      stub.on("GET", "/v1/benchmarks/runs/:runId/progress", () =>
        json(runProgress({ abandoned: true })),
      );
      const { wrapper } = setup();

      const { result } = renderHook(
        () => useRunProgress("dead-1", { pollMs: 20 }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stub.requests).toHaveLength(1);
    });

    it("keeps the last progress on screen when a poll fails", async () => {
      let calls = 0;
      stub.on("GET", "/v1/benchmarks/runs/:runId/progress", () => {
        calls += 1;
        if (calls === 1) return json(runProgress({ completed: 5 }));
        throw new TypeError("Failed to fetch");
      });
      const { wrapper } = setup();

      const { result } = renderHook(
        () => useRunProgress("live-1", { pollMs: 20 }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isRefetchError).toBe(true));
      expect(result.current.data?.completed).toBe(5);
    });
  });
});
