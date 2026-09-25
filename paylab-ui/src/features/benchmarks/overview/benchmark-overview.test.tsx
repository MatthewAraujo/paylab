import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BenchmarkApiStub,
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "@/test/benchmark-api-stub";
import {
  baselineView,
  capabilityOffBody,
  metric,
  notFoundBody,
  runPage,
  runProgress,
  scenario,
} from "@/test/benchmark-fixtures";
import {
  defaultComparison,
  headline,
  LATEST_ID,
  LOAD_SCENARIO,
  latestDetail,
  latestItem,
  PREVIOUS_ID,
  previousDetail,
  previousItem,
  READ_SCENARIO,
  serveOverview,
} from "@/test/benchmark-fixtures-overview";
import { BenchmarkOverview } from "./benchmark-overview";

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BenchmarkOverview />
    </QueryClientProvider>,
  );
  return { queryClient };
}

const region = (name: string) => screen.getByRole("region", { name });

describe("Benchmarks overview", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    stub = createBenchmarkApiStub().install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("a completed native latest Run", () => {
    beforeEach(() => {
      serveOverview(stub);
    });

    it("shows identity, exact time, abbreviated commit with copy and reveal, branch, note and provenance", async () => {
      renderOverview();

      const latest = await screen.findByRole("region", { name: "Latest Run" });
      expect(within(latest).getByText("COMPLETED")).toBeInTheDocument();
      expect(within(latest).getByText("Native")).toBeInTheDocument();
      expect(within(latest).getByText(LATEST_ID)).toBeInTheDocument();
      const time = within(latest).getByText("2026-09-23 14:08:12 UTC");
      expect(time).toHaveAttribute("datetime", "2026-09-23T14:08:12.000Z");
      expect(within(latest).getByText("8a2c91f")).toBeInTheDocument();
      expect(
        within(latest).getByRole("button", { name: "Copy commit" }),
      ).toBeInTheDocument();
      expect(
        within(latest).getByRole("button", { name: "Show full commit" }),
      ).toBeInTheDocument();
      expect(
        within(latest).getByText("feature/settlement-index"),
      ).toBeInTheDocument();
      expect(
        within(latest).getByText("After adding the settlement lookup index"),
      ).toBeInTheDocument();
      expect(within(latest).getByText("78m 24s")).toBeInTheDocument();
    });

    it("reveals the full commit on request", async () => {
      renderOverview();
      const latest = await screen.findByRole("region", { name: "Latest Run" });

      await userEvent.click(
        within(latest).getByRole("button", { name: "Show full commit" }),
      );

      expect(within(latest).getByText("8a2c91f0d3b4e5a6")).toBeInTheDocument();
    });

    it("features declared headline measurements with their scenario, and says what is not declared", async () => {
      renderOverview();

      const headlines = await screen.findByRole("region", {
        name: "Headline measurements",
      });
      expect(within(headlines).getByLabelText("Scenario")).toHaveValue(
        LOAD_SCENARIO,
      );
      const throughput = within(headlines).getByRole("article", {
        name: "Throughput",
      });
      expect(within(throughput).getByText("164.4")).toBeInTheDocument();
      expect(within(throughput).getByText("tx/s")).toBeInTheDocument();
      expect(within(throughput).getByText(LOAD_SCENARIO)).toBeInTheDocument();
      const latency = within(headlines).getByRole("article", {
        name: "Latency p99",
      });
      expect(within(latency).getByText("41")).toBeInTheDocument();
      const errorRate = within(headlines).getByRole("article", {
        name: "Error rate",
      });
      expect(within(errorRate).getByText("Not declared")).toBeInTheDocument();
      expect(
        within(headlines).getByRole("article", { name: "Duration" }),
      ).toHaveTextContent("Not declared");
    });

    it("changes the featured scenario with the selector", async () => {
      renderOverview();
      const headlines = await screen.findByRole("region", {
        name: "Headline measurements",
      });

      await userEvent.selectOptions(
        within(headlines).getByLabelText("Scenario"),
        READ_SCENARIO,
      );

      const duration = within(headlines).getByRole("article", {
        name: "Duration",
      });
      expect(within(duration).getByText("12")).toBeInTheDocument();
      expect(within(duration).getByText(READ_SCENARIO)).toBeInTheDocument();
      expect(
        within(headlines).getByRole("article", { name: "Throughput" }),
      ).toHaveTextContent("Not declared");
    });

    it("compares each featured value with the previous compatible Run, direction aware", async () => {
      renderOverview();
      const headlines = await screen.findByRole("region", {
        name: "Headline measurements",
      });

      const throughput = within(headlines).getByRole("article", {
        name: "Throughput",
      });
      expect(
        await within(throughput).findByText("Improved"),
      ).toBeInTheDocument();
      expect(within(throughput).getByText(/\+13\.2 tx\/s/)).toBeInTheDocument();
      expect(within(throughput).getByText(/\+8\.7%/)).toBeInTheDocument();
      const latency = within(headlines).getByRole("article", {
        name: "Latency p99",
      });
      expect(await within(latency).findByText("Regressed")).toBeInTheDocument();
    });

    it("summarizes the difference from the previous compatible Run and lists notable changes", async () => {
      renderOverview();

      const difference = await screen.findByRole("region", {
        name: "Difference from the previous compatible Run",
      });
      expect(
        within(difference).getByRole("link", { name: PREVIOUS_ID }),
      ).toHaveAttribute("href", `/benchmarks/runs/${PREVIOUS_ID}`);
      expect(
        await within(difference).findByText("1 improved"),
      ).toBeInTheDocument();
      expect(within(difference).getByText("1 stable")).toBeInTheDocument();
      expect(within(difference).getByText("1 regressed")).toBeInTheDocument();

      const improvements = await within(difference).findByRole("list", {
        name: "Improvements",
      });
      expect(
        within(improvements).getByText(/Settlements per second/),
      ).toBeInTheDocument();
      const regressions = within(difference).getByRole("list", {
        name: "Regressions",
      });
      expect(within(regressions).getByText(/Latency p99/)).toBeInTheDocument();
    });

    it("caps the notable changes and points to the comparison for the rest", async () => {
      const many = (value: (index: number) => number) =>
        Array.from({ length: 7 }, (_, index) =>
          metric({
            key: `m${index}`,
            label: `Metric ${index}`,
            value: value(index),
          }),
        );
      serveOverview(stub, {
        details: [
          latestDetail({
            scenarios: [
              scenario({ id: LOAD_SCENARIO, metrics: many(() => 200) }),
            ],
          }),
          previousDetail({
            scenarios: [
              scenario({
                id: LOAD_SCENARIO,
                metrics: many((index) => 100 - index),
              }),
            ],
          }),
        ],
      });
      renderOverview();

      const improvements = await screen.findByRole("list", {
        name: "Improvements",
      });
      expect(within(improvements).getAllByRole("listitem")).toHaveLength(5);
      expect(screen.getByText("2 more improvements")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Open the full comparison" }),
      ).toHaveAttribute(
        "href",
        `/benchmarks/compare?current=${LATEST_ID}&reference=${PREVIOUS_ID}`,
      );
    });

    it("indicates the Baseline compactly from the light Run item", async () => {
      serveOverview(stub, {
        baseline: baselineView({
          baseline: { runId: PREVIOUS_ID, selectedAt: "2026-09-24T09:00:00Z" },
          run: previousItem(),
        }),
      });
      renderOverview();

      const baseline = await screen.findByRole("region", { name: "Baseline" });
      expect(
        await within(baseline).findByRole("link", { name: PREVIOUS_ID }),
      ).toHaveAttribute("href", `/benchmarks/runs/${PREVIOUS_ID}`);
      expect(within(baseline).getByText("151.2")).toBeInTheDocument();
      expect(within(baseline).getByText("Improved")).toBeInTheDocument();
    });

    it("says no Baseline is selected when there is none", async () => {
      renderOverview();

      const baseline = await screen.findByRole("region", { name: "Baseline" });
      expect(
        await within(baseline).findByText("No Baseline selected"),
      ).toBeInTheDocument();
    });

    it("groups scenarios with counts", async () => {
      renderOverview();

      const groups = await screen.findByRole("region", {
        name: "Scenario groups",
      });
      const load = await within(groups).findByRole("listitem", {
        name: "Concurrency and load (T14)",
      });
      expect(within(load).getByText("1 of 1 completed")).toBeInTheDocument();
      expect(
        within(groups).getByRole("listitem", {
          name: "Reads and index behavior (T13)",
        }),
      ).toBeInTheDocument();
    });

    it("links to the comparison, the Run detail and the trends with the right identifiers", async () => {
      renderOverview();
      const latest = await screen.findByRole("region", { name: "Latest Run" });

      expect(
        within(latest).getByRole("link", { name: "Open Run detail" }),
      ).toHaveAttribute("href", `/benchmarks/runs/${LATEST_ID}`);
      expect(
        await screen.findByRole("link", { name: "Open the full comparison" }),
      ).toHaveAttribute(
        "href",
        `/benchmarks/compare?current=${LATEST_ID}&reference=${PREVIOUS_ID}`,
      );
      expect(
        screen.getByRole("link", { name: "Historical trends" }),
      ).toHaveAttribute("href", "/benchmarks/trends");
    });

    it("has no execution control and no composite score", async () => {
      renderOverview();
      await screen.findByRole("region", { name: "Latest Run" });

      expect(
        screen.queryByRole("button", { name: /start|cancel|pause|run again/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
    });
  });

  describe("recent history", () => {
    it("lists Runs with headline values and loads more through the cursor", async () => {
      const older = previousItem({
        runId: "2026-09-01T10-00-00Z-1111111",
        startedAt: "2026-09-01T10:00:00.000Z",
      });
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [latestItem(), previousItem()],
            nextCursor: "cursor-2",
          }),
          "cursor-2": runPage({ items: [older], nextCursor: null }),
        },
      });
      renderOverview();

      const history = await screen.findByRole("region", {
        name: "Recent Runs",
      });
      expect(
        within(history).getByRole("link", { name: LATEST_ID }),
      ).toHaveAttribute("href", `/benchmarks/runs/${LATEST_ID}`);
      expect(within(history).getAllByText("164.4 tx/s")).not.toHaveLength(0);
      expect(within(history).getByText("151.2 tx/s")).toBeInTheDocument();

      await userEvent.click(
        within(history).getByRole("button", { name: "Load more Runs" }),
      );

      expect(
        await within(history).findByRole("link", {
          name: "2026-09-01T10-00-00Z-1111111",
        }),
      ).toBeInTheDocument();
      expect(
        within(history).queryByRole("button", { name: "Load more Runs" }),
      ).not.toBeInTheDocument();
      expect(
        stub.requests
          .filter((request) => request.path === "/v1/benchmarks/runs")
          .map((request) => request.query.get("cursor")),
      ).toEqual([null, "cursor-2"]);
    });
  });

  describe("no declared headline", () => {
    it("shows a calm state instead of inventing a headline", async () => {
      serveOverview(stub, {
        pages: {
          "": runPage({ items: [latestItem({ headlineMetrics: [] })] }),
        },
      });
      renderOverview();

      expect(
        await screen.findByText("No headline measurement declared"),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Scenario")).not.toBeInTheDocument();
    });

    it("features the first scenario that declares highlights", async () => {
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [
              latestItem({
                headlineMetrics: [
                  headline({
                    scenarioId: READ_SCENARIO,
                    summaryRole: "DURATION",
                    key: "duration",
                    label: "Balance read duration",
                    unit: "ms",
                    value: 12,
                    dimensions: undefined,
                  }),
                ],
              }),
            ],
          }),
        },
      });
      renderOverview();

      expect(await screen.findByLabelText("Scenario")).toHaveValue(
        READ_SCENARIO,
      );
    });
  });

  describe("an incomplete latest Run", () => {
    beforeEach(() => {
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [
              latestItem({
                status: "INCOMPLETE",
                failure: {
                  scenarioId: READ_SCENARIO,
                  summary: `Scenario ${READ_SCENARIO} exited with status 1`,
                },
                scenarioCounts: {
                  total: 2,
                  pending: 0,
                  active: 0,
                  completed: 1,
                  failed: 1,
                },
              }),
              previousItem(),
            ],
          }),
        },
        details: [
          latestDetail({
            status: "INCOMPLETE",
          }),
          previousDetail(),
        ],
        comparison: defaultComparison({
          current: previousItem(),
          reference: previousItem({ runId: "2026-09-09T10-00-00Z-2222222" }),
        }),
      });
    });

    it("explains the failure, links to the detail and classifies nothing", async () => {
      renderOverview();

      const latest = await screen.findByRole("region", { name: "Latest Run" });
      expect(within(latest).getByText("INCOMPLETE")).toBeInTheDocument();
      expect(
        within(latest).getByText(
          `Scenario ${READ_SCENARIO} exited with status 1`,
        ),
      ).toBeInTheDocument();
      expect(
        within(latest).getByRole("link", { name: "Open Run detail" }),
      ).toHaveAttribute("href", `/benchmarks/runs/${LATEST_ID}`);
      expect(
        screen.queryByRole("region", { name: "Headline measurements" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Improved")).not.toBeInTheDocument();
      expect(screen.queryByText("Regressed")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", {
          name: "Difference from the previous compatible Run",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("a running latest Run", () => {
    it("shows the active-Run panel and no headline classification", async () => {
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [latestItem({ status: "RUNNING", finishedAt: undefined })],
          }),
        },
      });
      stub.on("GET", "/v1/benchmarks/runs/:runId/progress", () =>
        json(runProgress({ runId: LATEST_ID })),
      );
      stub.on("GET", "/v1/benchmarks/runs/:runId/artifacts/:artifactId", () =>
        json(notFoundBody("BENCHMARK_ARTIFACT_NOT_FOUND"), 404),
      );
      renderOverview();

      const panel = await screen.findByRole("region", { name: "Active Run" });
      expect(within(panel).getByText("3 of 17 scenarios (18%)")).toBeVisible();
      expect(
        screen.queryByRole("region", { name: "Headline measurements" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("an imported latest Run", () => {
    it("names its provenance and shows absent values as not recorded", async () => {
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [
              latestItem({
                kind: "imported",
                source: { commit: "unknown", branch: "main" },
                finishedAt: undefined,
                durationMs: undefined,
                note: undefined,
              }),
            ],
          }),
        },
        details: [
          latestDetail({
            kind: "imported",
            source: { commit: "unknown", branch: "main" },
            imported: { source: "docs/experiments/T14-results.md" },
          }),
        ],
        comparison: json({ message: "none" }, 404),
      });
      renderOverview();

      const latest = await screen.findByRole("region", { name: "Latest Run" });
      expect(within(latest).getByText("Imported")).toBeInTheDocument();
      expect(
        await within(latest).findByText("docs/experiments/T14-results.md"),
      ).toBeInTheDocument();
      expect(within(latest).getAllByText("Not recorded")).not.toHaveLength(0);
    });
  });

  describe("states", () => {
    it("says Benchmarks are not available when the capability is off", async () => {
      stub.on("GET", "/v1/benchmarks/runs", () =>
        json(capabilityOffBody(), 404),
      );
      renderOverview();

      expect(
        await screen.findByRole("heading", {
          name: "Benchmarks are not available",
        }),
      ).toBeInTheDocument();
    });

    it("offers a retry when the API is unreachable, then recovers", async () => {
      stub.on("GET", "/v1/benchmarks/runs", networkFailure());
      renderOverview();

      expect(
        await screen.findByRole("heading", {
          name: "Benchmark API unreachable",
        }),
      ).toBeInTheDocument();

      serveOverview(stub);
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(
        await screen.findByRole("region", { name: "Latest Run" }),
      ).toBeInTheDocument();
    });

    it("shows a loading state while the Runs are read", () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs",
        () => new Promise<Response>(() => {}),
      );
      renderOverview();

      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("Loading Benchmark Runs")).toBeInTheDocument();
    });

    it("shows the empty state when no Run has been published", async () => {
      serveOverview(stub, { pages: { "": runPage({ items: [] }) } });
      renderOverview();

      expect(
        await screen.findByRole("heading", { name: "No Benchmark Runs yet" }),
      ).toBeInTheDocument();
    });

    it("keeps the previous data and says so when a refresh fails", async () => {
      serveOverview(stub);
      const { queryClient } = renderOverview();
      await screen.findByRole("region", { name: "Latest Run" });

      stub.on("GET", "/v1/benchmarks/runs", networkFailure());
      await act(() => queryClient.invalidateQueries());

      expect(
        await screen.findByText(/Refresh failed\. Showing data from/),
      ).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Latest Run" })).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Benchmark API unreachable" }),
      ).not.toBeInTheDocument();
    });

    it("mentions isolated unreadable records without hiding the history", async () => {
      serveOverview(stub, {
        pages: {
          "": runPage({
            items: [latestItem()],
            skipped: [{ file: "broken.json", reason: "not valid JSON" }],
          }),
        },
      });
      renderOverview();

      expect(
        await screen.findByText(
          "1 stored Run record was skipped because it could not be read.",
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("region", { name: "Latest Run" }),
      ).toBeInTheDocument();
    });

    it("degrades the comparison alone when it cannot be read", async () => {
      serveOverview(stub, { comparison: json({ message: "none" }, 404) });
      renderOverview();

      const latest = await screen.findByRole("region", { name: "Latest Run" });
      expect(latest).toBeVisible();
      await waitFor(() =>
        expect(
          screen.getByText("No previous compatible Run to compare with."),
        ).toBeInTheDocument(),
      );
      expect(region("Headline measurements")).toBeVisible();
    });
  });
});
