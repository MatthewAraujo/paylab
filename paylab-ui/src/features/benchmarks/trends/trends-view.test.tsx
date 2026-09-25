import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BenchmarkApiStub,
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "@/test/benchmark-api-stub";
import {
  capabilityOffBody,
  metric,
  runDetail,
  runListItem,
  runPage,
  scenario,
  trend,
  validationBody,
} from "@/test/benchmark-fixtures";
import { denseTrend } from "@/test/benchmark-fixtures-trends";

let search = "";
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => "/benchmarks/trends",
}));

import { TrendsView } from "./trends-view";

const baseUrl = "http://api.test";
const at = (n: number) => `2026-09-${String(n).padStart(2, "0")}T12:00:00.000Z`;

let stub: BenchmarkApiStub;

const scenarios = [
  scenario({
    id: "t14.load.M.c64.sync-on",
    title: "Concurrency strategies, shape M",
    metrics: [
      metric({
        key: "tps",
        label: "Settlements per second",
        dimensions: { strategy: "nokey" },
      }),
      metric({
        key: "tps",
        label: "Settlements per second",
        dimensions: { strategy: "key" },
      }),
      metric({
        key: "p99",
        label: "p99 latency",
        unit: "ms",
        dimensions: undefined,
      }),
    ],
  }),
  scenario({
    id: "t13.reads",
    title: "Index reads",
    metrics: [
      metric({
        key: "rows",
        label: "Rows read",
        unit: "count",
        dimensions: undefined,
      }),
    ],
  }),
];

beforeEach(() => {
  search = "";
  replace.mockReset();
  stub = createBenchmarkApiStub().install();
  stub.on(
    "GET",
    "/v1/benchmarks/runs",
    json(
      runPage({
        items: [
          runListItem({
            runId: "a",
            startedAt: at(2),
            source: { commit: "8a2c91f7654321", branch: "main" },
            note: "After the index",
          }),
          runListItem({
            runId: "old",
            status: "INCOMPLETE",
            startedAt: at(1),
          }),
        ],
      }),
    ),
  );
  stub.on(
    "GET",
    "/v1/benchmarks/runs/:runId",
    json(runDetail({ runId: "a", scenarios })),
  );
  stub.on(
    "GET",
    "/v1/benchmarks/trends",
    json(
      trend({
        points: [
          { runId: "a", startedAt: at(2), kind: "native", value: 164.4 },
        ],
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TrendsView baseUrl={baseUrl} />
    </QueryClientProvider>,
  );
}

const trendRequests = () =>
  stub.requests.filter((request) => request.path === "/v1/benchmarks/trends");

describe("TrendsView", () => {
  it("defaults to the newest completed Run's first scenario, metric and dimension", async () => {
    renderView();

    expect(
      await screen.findByRole("img", { name: /Settlements per second/ }),
    ).toBeInTheDocument();
    const request = trendRequests()[0];
    expect(request.query.get("scenarioId")).toBe("t14.load.M.c64.sync-on");
    expect(request.query.get("metric")).toBe("tps");
    expect(request.query.getAll("dimension")).toEqual(["strategy:nokey"]);
    expect(stub.requests.some((r) => r.path === "/v1/benchmarks/runs/a")).toBe(
      true,
    );
    expect(screen.getByLabelText("Scenario")).toHaveValue(
      "t14.load.M.c64.sync-on",
    );
    expect(screen.getByLabelText("Metric")).toHaveValue("tps");
    expect(screen.getByLabelText("Dimension")).toHaveValue("strategy:nokey");
  });

  it("reads the selection from the address", async () => {
    search = "scenario=t13.reads&metric=rows";
    renderView();

    await waitFor(() => expect(trendRequests()).toHaveLength(1));
    expect(trendRequests()[0].query.get("scenarioId")).toBe("t13.reads");
    expect(trendRequests()[0].query.get("metric")).toBe("rows");
    expect(trendRequests()[0].query.getAll("dimension")).toEqual([]);
    expect(await screen.findByLabelText("Scenario")).toHaveValue("t13.reads");
    expect(screen.queryByLabelText("Dimension")).not.toBeInTheDocument();
  });

  it("writes a change of metric to the address", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole("img");

    await user.selectOptions(screen.getByLabelText("Metric"), "p99");

    expect(replace).toHaveBeenCalledWith(
      "/benchmarks/trends?scenario=t14.load.M.c64.sync-on&metric=p99",
    );
  });

  it("writes a change of dimension to the address", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole("img");

    await user.selectOptions(
      screen.getByLabelText("Dimension"),
      "strategy:key",
    );

    expect(replace).toHaveBeenCalledWith(
      "/benchmarks/trends?scenario=t14.load.M.c64.sync-on&metric=tps&dimension=strategy%3Akey",
    );
  });

  it("resets metric and dimension when the scenario changes", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByRole("img");

    await user.selectOptions(screen.getByLabelText("Scenario"), "t13.reads");

    expect(replace).toHaveBeenCalledWith(
      "/benchmarks/trends?scenario=t13.reads&metric=rows",
    );
  });

  it("states unit and direction and shows the exact table with the commit and note joined from the Run list", async () => {
    renderView();

    await screen.findByRole("img");
    expect(
      screen.getByText(/Higher is better/, { selector: "p, span, dd" }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    const row = within(table).getAllByRole("row")[1];
    expect(row).toHaveTextContent("164.4 tx/s");
    expect(row).toHaveTextContent("8a2c91f");
    expect(row).toHaveTextContent("After the index");
  });

  it("explains that one point has no line", async () => {
    renderView();

    expect(
      await screen.findByText(/only one compatible Run/i),
    ).toBeInTheDocument();
  });

  it("says plainly when there is no compatible history", async () => {
    stub.on(
      "GET",
      "/v1/benchmarks/trends",
      json(trend({ points: [], reference: null })),
    );
    renderView();

    expect(
      await screen.findByText(/no compatible history/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("still lists Runs left out when there are no points", async () => {
    stub.on(
      "GET",
      "/v1/benchmarks/trends",
      json(
        trend({
          points: [],
          excluded: [{ runId: "x", startedAt: at(1), reason: "changed" }],
        }),
      ),
    );
    renderView();

    expect(
      await screen.findByText(/Left out: Scenario definition changed/),
    ).toBeInTheDocument();
  });

  it("shows imported points as such", async () => {
    stub.on(
      "GET",
      "/v1/benchmarks/trends",
      json(
        trend({
          points: [
            { runId: "i1", startedAt: at(1), kind: "imported", value: 100 },
            { runId: "i2", startedAt: at(1), kind: "imported", value: 110 },
          ],
        }),
      ),
    );
    renderView();

    await screen.findByRole("img");
    expect(screen.getAllByText("Imported").length).toBeGreaterThanOrEqual(2);
  });

  it("handles a dense history", async () => {
    stub.on("GET", "/v1/benchmarks/trends", json(denseTrend(120)));
    renderView();

    await screen.findByRole("img");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      121,
    );
  });

  it("shows the API's reason for a scenario it does not know", async () => {
    search = "scenario=gone&metric=tps";
    stub.on(
      "GET",
      "/v1/benchmarks/trends",
      json(validationBody("VALIDATION_ERROR", "Unknown scenario gone."), 422),
    );
    renderView();

    expect(
      await screen.findByText(/Unknown scenario gone/),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Scenario")).toHaveValue("gone");
  });

  it("explains that there is nothing to trend without a completed Run", async () => {
    stub.on(
      "GET",
      "/v1/benchmarks/runs",
      json(runPage({ items: [runListItem({ status: "INCOMPLETE" })] })),
    );
    renderView();

    expect(
      await screen.findByText(/no completed Benchmark Run/i),
    ).toBeInTheDocument();
  });

  it("says benchmarks are not available when the capability is off", async () => {
    stub.on("GET", "/v1/benchmarks/runs", json(capabilityOffBody(), 404));
    renderView();

    expect(
      await screen.findByText(/benchmarks are not available/i),
    ).toBeInTheDocument();
  });

  it("offers a retry when the API cannot be reached", async () => {
    stub.on("GET", "/v1/benchmarks/runs", networkFailure());
    const user = userEvent.setup();
    renderView();
    expect(
      await screen.findByText(/api unreachable/i, {}, { timeout: 4000 }),
    ).toBeInTheDocument();

    stub.on(
      "GET",
      "/v1/benchmarks/runs",
      json(runPage({ items: [runListItem({ runId: "a" })] })),
    );
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("img")).toBeInTheDocument();
  }, 15000);
});
