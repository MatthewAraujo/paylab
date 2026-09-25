import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
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
  notFoundBody,
  type RunProgress,
  runProgress,
} from "@/test/benchmark-fixtures";
import { ActiveRunPanel } from "./active-run-panel";

const RUN = "2026-09-24T10-00-00Z-abc1234";
const STARTED = "2026-09-24T10:00:00.000Z";
const CURRENT = "t14.load.H.c16.sync-off";
const POLL = 3000;

const progressPath = "/v1/benchmarks/runs/:runId/progress";
const artifactPath = "/v1/benchmarks/runs/:runId/artifacts/:artifactId";
const contentPath = `${artifactPath}/content`;

const progressRequests = (stub: BenchmarkApiStub) =>
  stub.requests.filter((request) => request.path.endsWith("/progress")).length;

function renderPanel(onSettled = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveRunPanel
        runId={RUN}
        startedAt={STARTED}
        pollMs={POLL}
        onSettled={onSettled}
      />
    </QueryClientProvider>,
  );
  return { onSettled };
}

const tick = (ms = POLL) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("ActiveRunPanel", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-24T10:05:30.000Z"));
    stub = createBenchmarkApiStub().install();
    stub.on("GET", progressPath, () => json(runProgress({ runId: RUN })));
    stub.on("GET", artifactPath, () => json(artifact({ sizeBytes: 100 })));
    stub.on("GET", contentPath, ({ query }) =>
      json(
        artifactContent({
          content: "started\nblock rep=1/3\n",
          offset: Number(query.get("offset") ?? 0),
          sizeBytes: 100,
        }),
      ),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the running status, counts, the current scenario, elapsed time and progress with a text value", async () => {
    renderPanel();

    const panel = await screen.findByRole("region", { name: "Active Run" });
    expect(within(panel).getByText("RUNNING")).toBeInTheDocument();
    expect(within(panel).getByText("3 completed")).toBeInTheDocument();
    expect(within(panel).getByText("1 active")).toBeInTheDocument();
    expect(within(panel).getByText("13 pending")).toBeInTheDocument();
    expect(within(panel).getByText("0 failed")).toBeInTheDocument();
    expect(within(panel).getByText(CURRENT)).toBeInTheDocument();
    expect(within(panel).getByText("5m 30s")).toBeInTheDocument();
    expect(
      within(panel).getByRole("progressbar", { name: "Run progress" }),
    ).toHaveAttribute("value", "3");
    expect(within(panel).getByText("3 of 17 scenarios (18%)")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "Open Run detail" }),
    ).toHaveAttribute("href", `/benchmarks/runs/${RUN}`);
  });

  it("says polling, never live, and shows the last successful refresh", async () => {
    renderPanel();

    const panel = await screen.findByRole("region", { name: "Active Run" });
    expect(within(panel).getByText(/polling every 3 s/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/last successful refresh/i),
    ).toHaveTextContent("2026-09-24 10:05:30 UTC");
    expect(panel.textContent).not.toMatch(/\blive\b/i);
  });

  it("polls, keeps the visible content between refreshes and updates the refresh time", async () => {
    renderPanel();
    await screen.findByRole("region", { name: "Active Run" });
    expect(progressRequests(stub)).toBe(1);

    await tick();

    expect(progressRequests(stub)).toBe(2);
    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull();
    expect(screen.getByRole("region", { name: "Active Run" })).toBeVisible();
    expect(screen.getByText(/last successful refresh/i)).toHaveTextContent(
      "2026-09-24 10:05:33 UTC",
    );
  });

  it("stops polling when the Run completes and reports it once", async () => {
    let calls = 0;
    stub.on("GET", progressPath, () => {
      calls += 1;
      return json(
        runProgress({
          runId: RUN,
          status: calls > 1 ? "COMPLETED" : "RUNNING",
          completed: calls > 1 ? 17 : 3,
        }),
      );
    });
    const { onSettled } = renderPanel();
    await screen.findByRole("region", { name: "Active Run" });

    await tick();
    await tick();
    await tick();
    await tick();

    expect(progressRequests(stub)).toBe(2);
    expect(screen.getByText(/polling stopped/i)).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("stops polling for an INCOMPLETE Run too", async () => {
    let calls = 0;
    stub.on("GET", progressPath, () => {
      calls += 1;
      return json(
        runProgress({
          runId: RUN,
          status: calls > 1 ? "INCOMPLETE" : "RUNNING",
        }),
      );
    });
    renderPanel();
    await screen.findByRole("region", { name: "Active Run" });

    await tick();
    await tick();
    await tick();

    expect(progressRequests(stub)).toBe(2);
    expect(screen.getByText("INCOMPLETE")).toBeInTheDocument();
  });

  it("explains an abandoned record instead of showing progress, and does not poll", async () => {
    stub.on("GET", progressPath, () =>
      json(runProgress({ runId: RUN, abandoned: true })),
    );
    renderPanel();

    const panel = await screen.findByRole("region", { name: "Active Run" });
    expect(
      within(panel).getByText(/process that was running this Run is gone/i),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole("progressbar")).toBeNull();

    await tick();
    await tick();

    expect(progressRequests(stub)).toBe(1);
  });

  it("keeps the last data and says so when a refresh fails", async () => {
    renderPanel();
    await screen.findByRole("region", { name: "Active Run" });

    stub.on("GET", progressPath, networkFailure());
    await tick();
    await tick();

    expect(
      await screen.findByText(/Refresh failed\. Showing data from/),
    ).toBeInTheDocument();
    expect(screen.getByText("3 completed")).toBeInTheDocument();
    expect(screen.getByText(CURRENT)).toBeInTheDocument();
  });

  it("offers a retry when the first read fails", async () => {
    stub.on("GET", progressPath, networkFailure());
    renderPanel();

    expect(
      await screen.findByRole("heading", { name: "Benchmark API unreachable" }),
    ).toBeInTheDocument();
  });

  describe("the recent log", () => {
    it("reads the end of the active scenario's log through its size, drops the partial first line and renders text", async () => {
      stub.on("GET", artifactPath, () =>
        json(artifact({ id: `${CURRENT}-log`, sizeBytes: 10_000 })),
      );
      stub.on("GET", contentPath, ({ query, params }) => {
        expect(params.artifactId).toBe(`${CURRENT}-log`);
        return json(
          artifactContent({
            content: "rtial line\nsecond <b>bold</b>\nthird\n",
            offset: Number(query.get("offset")),
            sizeBytes: 10_000,
          }),
        );
      });
      renderPanel();

      const log = await screen.findByLabelText("Recent log output");
      expect(await within(log).findByText(/second <b>bold<\/b>/)).toBeVisible();
      expect(within(log).getByText(/third/)).toBeInTheDocument();
      expect(within(log).queryByText(/rtial line/)).toBeNull();
      expect(log.querySelector("b")).toBeNull();

      const request = stub.requests.find((entry) =>
        entry.path.endsWith("/content"),
      );
      expect(request?.query.get("offset")).toBe("5904");
      expect(request?.query.get("limit")).toBe("4096");
    });

    it("says there is no output yet when the log is not available", async () => {
      stub.on("GET", artifactPath, () =>
        json(notFoundBody("BENCHMARK_ARTIFACT_NOT_FOUND"), 404),
      );
      renderPanel();

      expect(await screen.findByText("No log output yet.")).toBeInTheDocument();
    });

    it("does not announce log lines: the log is outside any live region", async () => {
      renderPanel();
      const log = await screen.findByLabelText("Recent log output");

      expect(log.closest("[aria-live]")).toBeNull();
      expect(log).not.toHaveAttribute("aria-live");
    });
  });

  describe("announcements", () => {
    it("announces the current scenario politely, and only when it changes", async () => {
      let calls = 0;
      stub.on("GET", progressPath, () => {
        calls += 1;
        const next: RunProgress = runProgress({
          runId: RUN,
          current: calls > 2 ? "t14.load.H.c16.sync-on" : CURRENT,
        });
        return json(next);
      });
      renderPanel();
      await screen.findByRole("region", { name: "Active Run" });

      const announcer = screen.getByRole("status", {
        name: "Run announcements",
      });
      expect(announcer).toHaveAttribute("aria-live", "polite");
      expect(announcer).toHaveTextContent(`Now running ${CURRENT}`);

      await tick();
      expect(announcer).toHaveTextContent(`Now running ${CURRENT}`);

      await tick();
      expect(announcer).toHaveTextContent("Now running t14.load.H.c16.sync-on");
    });
  });
});
