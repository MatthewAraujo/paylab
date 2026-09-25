import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
  runDetail,
  runListItem,
  runPage,
  scenario,
  validationBody,
} from "@/test/benchmark-fixtures";
import {
  CURRENT_RUN_ID,
  comparisonFixture,
  REFERENCE_RUN_ID,
} from "@/test/benchmark-fixtures-detail";
import { ComparisonView } from "./comparison-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
}));

function renderView(props: Parameters<typeof ComparisonView>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ComparisonView baseUrl="http://api.test" {...props} />
    </QueryClientProvider>,
  );
}

const tile = (name: string) =>
  screen.getByText(name, { selector: "dt" }).nextElementSibling?.textContent;

describe("the Benchmark Comparison", () => {
  let stub: BenchmarkApiStub;
  const fixture = comparisonFixture();

  function serveRuns(details = [fixture.current, fixture.reference]) {
    stub.on("GET", "/v1/benchmarks/runs/:runId", ({ params }) => {
      const found = details.find((run) => run.runId === params.runId);
      return found
        ? json(found)
        : json(notFoundBody("BENCHMARK_RUN_NOT_FOUND"), 404);
    });
  }

  beforeEach(() => {
    push.mockReset();
    stub = createBenchmarkApiStub().install();
    stub.on(
      "GET",
      "/v1/benchmarks/comparisons/default",
      json(fixture.response),
    );
    stub.on("GET", "/v1/benchmarks/comparisons", json(fixture.response));
    stub.on("GET", "/v1/benchmarks/baseline", json(baselineView()));
    stub.on(
      "GET",
      "/v1/benchmarks/runs",
      json(
        runPage({
          items: [
            runListItem({ runId: CURRENT_RUN_ID }),
            runListItem({
              runId: "2026-09-20T10-00-00Z-bad0001",
              status: "INCOMPLETE",
              startedAt: "2026-09-20T10:00:00.000Z",
            }),
            runListItem({
              runId: REFERENCE_RUN_ID,
              startedAt: "2026-09-16T18:30:00.000Z",
            }),
          ],
        }),
      ),
    );
    serveRuns();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("selection", () => {
    it("uses the default comparison when nothing is selected", async () => {
      renderView();

      expect(
        await screen.findByRole("heading", { name: "Compatibility" }),
      ).toBeInTheDocument();
      const paths = stub.requests.map((request) => request.path);
      expect(paths).toContain("/v1/benchmarks/comparisons/default");
    });

    it("reproduces a comparison from the address alone", async () => {
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      await screen.findByRole("heading", { name: "Compatibility" });
      const request = stub.requests.find(
        (r) => r.path === "/v1/benchmarks/comparisons",
      );
      expect(request?.query.get("current")).toBe(CURRENT_RUN_ID);
      expect(request?.query.get("reference")).toBe(REFERENCE_RUN_ID);
      expect(stub.requests.map((r) => r.path)).not.toContain(
        "/v1/benchmarks/comparisons/default",
      );
    });

    it("picks the most recent earlier compatible Run when only the current one is given", async () => {
      const skipped = "2026-09-18T10-00-00Z-aaaaaaa";
      stub.on(
        "GET",
        "/v1/benchmarks/runs",
        json(
          runPage({
            items: [
              runListItem({ runId: CURRENT_RUN_ID }),
              runListItem({
                runId: skipped,
                startedAt: "2026-09-18T10:00:00.000Z",
              }),
              runListItem({
                runId: REFERENCE_RUN_ID,
                startedAt: "2026-09-16T18:30:00.000Z",
              }),
            ],
          }),
        ),
      );
      stub.on("GET", "/v1/benchmarks/comparisons", ({ query }) =>
        query.get("reference") === skipped
          ? json({
              ...fixture.response,
              reference: runListItem({ runId: skipped }),
              comparison: {
                environmentCompatible: true,
                datasetCompatible: true,
                scenarios: [{ scenarioId: "t14.a", state: "changed" }],
              },
            })
          : json(fixture.response),
      );
      serveRuns([fixture.current, fixture.reference]);
      renderView({ current: CURRENT_RUN_ID });

      await screen.findByRole("heading", { name: "Compatibility" });
      const asked = stub.requests
        .filter((r) => r.path === "/v1/benchmarks/comparisons")
        .map((r) => r.query.get("reference"));
      expect(asked).toEqual([skipped, REFERENCE_RUN_ID]);
      expect(screen.getByLabelText("Reference Run")).toHaveValue(
        REFERENCE_RUN_ID,
      );
    });

    it("offers only completed Runs and lists the others as unavailable with the reason", async () => {
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      const select = await screen.findByLabelText("Reference Run");
      const incomplete = await within(select).findByRole("option", {
        name: /bad0001/,
      });
      expect(incomplete).toBeDisabled();
      expect(incomplete).toHaveTextContent(/unavailable.*INCOMPLETE/);
      expect(
        within(select).getByRole("option", {
          name: new RegExp(REFERENCE_RUN_ID),
        }),
      ).toBeEnabled();
    });

    it("updates the address when another Run is chosen", async () => {
      const user = userEvent.setup();
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      const select = await screen.findByLabelText("Current Run");
      await user.selectOptions(select, REFERENCE_RUN_ID);

      expect(push).toHaveBeenCalledWith(
        `/benchmarks/compare?current=${REFERENCE_RUN_ID}&reference=${REFERENCE_RUN_ID}`,
      );
    });

    it("swaps the two Runs in the address", async () => {
      const user = userEvent.setup();
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      await user.click(await screen.findByRole("button", { name: "Swap" }));

      expect(push).toHaveBeenCalledWith(
        `/benchmarks/compare?current=${REFERENCE_RUN_ID}&reference=${CURRENT_RUN_ID}`,
      );
    });

    it("uses the Baseline as the reference when there is one", async () => {
      const user = userEvent.setup();
      stub.on(
        "GET",
        "/v1/benchmarks/baseline",
        json(
          baselineView({
            baseline: {
              runId: "2026-09-10T00-00-00Z-b45e11e",
              selectedAt: "2026-09-17T00:00:00.000Z",
            },
            run: runListItem({ runId: "2026-09-10T00-00-00Z-b45e11e" }),
          }),
        ),
      );
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      await user.click(
        await screen.findByRole("button", {
          name: "Use the Baseline as reference",
        }),
      );

      expect(push).toHaveBeenCalledWith(
        `/benchmarks/compare?current=${CURRENT_RUN_ID}&reference=2026-09-10T00-00-00Z-b45e11e`,
      );
    });

    it("offers to make either compared Run the Baseline", async () => {
      const user = userEvent.setup();
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      await screen.findByRole("heading", { name: "Compatibility" });
      expect(
        screen.getByRole("button", {
          name: "Make the reference Run the Baseline",
        }),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", {
          name: "Make the current Run the Baseline",
        }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(CURRENT_RUN_ID)).toBeInTheDocument();
      expect(dialog).toHaveTextContent(/reviewable Git change/i);
    });

    it("does not offer the selection when the contract has no Baseline write", async () => {
      renderView({
        current: CURRENT_RUN_ID,
        reference: REFERENCE_RUN_ID,
        baselineWrite: false,
      });

      await screen.findByRole("heading", { name: "Compatibility" });
      expect(
        screen.queryByRole("button", { name: /Make .* Baseline/ }),
      ).toBeNull();
    });
  });

  describe("presentation", () => {
    beforeEach(() => {
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });
    });

    it("states environment and dataset compatibility before anything else", async () => {
      const compatibility = await screen.findByRole("heading", {
        name: "Compatibility",
      });
      const summary = screen.getByRole("heading", { name: "Summary" });
      expect(
        compatibility.compareDocumentPosition(summary) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const section = compatibility.closest("section") as HTMLElement;
      expect(
        within(section).getByText("Environment compatible"),
      ).toBeInTheDocument();
      expect(
        within(section).getByText("Dataset compatible"),
      ).toBeInTheDocument();
    });

    it("counts Improved, Stable, Regressed, Incompatible and Not recorded separately", async () => {
      await screen.findByRole("heading", { name: "Summary" });

      expect(tile("Improved")).toBe("1");
      expect(tile("Stable")).toBe("2");
      expect(tile("Regressed")).toBe("1");
      expect(tile("Incompatible")).toBe("2");
      expect(tile("Not recorded")).toBe("2");
      expect(
        screen.getByText(/within ±5% of the reference/),
      ).toBeInTheDocument();
    });

    it("gives every scenario one state and withholds the numbers of the ones that cannot be compared", async () => {
      await screen.findByRole("heading", { name: "Summary" });

      for (const label of [
        "Comparable",
        "New",
        "Removed",
        "Changed definition",
        "Environment incompatible",
        "Dataset incompatible",
      ]) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
      expect(
        screen.getByText(/definition differs between the Runs/),
      ).toBeInTheDocument();
      // one table only: the comparable scenario
      expect(screen.getAllByRole("table")).toHaveLength(1);
      expect(screen.queryByText("Label d")).toBeNull();
    });

    it("shows current, reference, delta, percentage and a textual classification", async () => {
      const table = await screen.findByRole("table", {
        name: "Comparison of Title of t14.a",
      });
      const row = (label: string) =>
        within(within(table).getByText(label).closest("tr") as HTMLElement);

      // exactly +5% is inside the Stable band, with raw values visible
      const tps = row("Label tps");
      expect(tps.getByText("105")).toBeInTheDocument();
      expect(tps.getByText("100")).toBeInTheDocument();
      expect(tps.getByText("+5 tx/s")).toBeInTheDocument();
      expect(tps.getByText("+5.0%")).toBeInTheDocument();
      expect(tps.getByText("Stable")).toBeInTheDocument();

      const p99 = row("Label p99");
      expect(p99.getByText("-10 ms")).toBeInTheDocument();
      expect(p99.getByText("-20.0%")).toBeInTheDocument();
      expect(p99.getByText("Improved")).toBeInTheDocument();

      // a move away from zero regresses, with no percentage
      const errors = row("Label errors");
      expect(errors.getByText("Regressed")).toBeInTheDocument();
      expect(errors.getByText("Not applicable")).toBeInTheDocument();

      expect(row("Label deadlocks").getByText("Stable")).toBeInTheDocument();
    });

    it("shows informational metrics without a classification", async () => {
      const table = await screen.findByRole("table", {
        name: "Comparison of Title of t14.a",
      });
      const row = within(
        within(table).getByText("Label samples").closest("tr") as HTMLElement,
      );
      expect(row.getByText("Informational")).toBeInTheDocument();
      expect(row.getByText("+10")).toBeInTheDocument();
      expect(row.queryByText(/Improved|Stable|Regressed/)).toBeNull();
    });

    it("shows a metric recorded on one side only as not recorded, never as zero", async () => {
      const table = await screen.findByRole("table", {
        name: "Comparison of Title of t14.a",
      });
      const row = within(
        within(table)
          .getByText("Label only_current")
          .closest("tr") as HTMLElement,
      );
      expect(row.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(2);
      expect(row.getByText("9")).toBeInTheDocument();
      expect(row.queryByText(/^0/)).toBeNull();
    });

    it("scrolls the table in a labelled, focusable region", async () => {
      const region = await screen.findByRole("region", {
        name: "Comparison of Title of t14.a, scrollable",
      });
      expect(region).toHaveAttribute("tabindex", "0");
    });
  });

  describe("a large comparison", () => {
    it("keeps groups and scenarios collapsed until opened", async () => {
      const user = userEvent.setup();
      const ids = Array.from({ length: 12 }, (_, index) => `t14.big${index}`);
      const build = (value: number, runId: string) =>
        runDetail({
          runId,
          scenarios: ids.map((id) =>
            scenario({
              id,
              group: "t14",
              title: `Big ${id}`,
              metrics: Array.from({ length: 10 }, (_, key) =>
                metric({
                  key: `k${key}`,
                  label: `Key ${key}`,
                  direction: "LOWER_IS_BETTER",
                  value,
                }),
              ),
            }),
          ),
        });
      stub.on(
        "GET",
        "/v1/benchmarks/comparisons",
        json({
          ...fixture.response,
          comparison: {
            environmentCompatible: true,
            datasetCompatible: true,
            scenarios: ids.map((scenarioId) => ({
              scenarioId,
              state: "comparable",
            })),
          },
        }),
      );
      serveRuns([build(2, CURRENT_RUN_ID), build(1, REFERENCE_RUN_ID)]);
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });

      const group = await screen.findByRole("button", {
        name: /Concurrency and load \(T14\)/,
      });
      expect(group).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryAllByRole("table")).toHaveLength(0);

      await user.click(group);
      expect(screen.queryAllByRole("table")).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: /Big t14\.big0/ }));
      expect(screen.getAllByRole("table")).toHaveLength(1);
      expect(screen.getAllByRole("row")).toHaveLength(11);
    });
  });

  describe("states", () => {
    it("shows a busy placeholder while loading", () => {
      renderView({ current: CURRENT_RUN_ID, reference: REFERENCE_RUN_ID });
      expect(screen.getAllByRole("status")[0]).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });

    it("says an unknown Run was not found", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/comparisons",
        json(notFoundBody("BENCHMARK_RUN_NOT_FOUND", "No such Run."), 404),
      );
      renderView({ current: "nope", reference: REFERENCE_RUN_ID });

      expect(
        await screen.findByRole("heading", { name: "Benchmark Run not found" }),
      ).toBeInTheDocument();
    });

    it("explains a refused comparison of a Run that cannot be compared", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/comparisons",
        json(
          validationBody(
            "BENCHMARK_RUN_NOT_COMPARABLE",
            "Only completed Runs can be compared.",
          ),
          422,
        ),
      );
      renderView({ current: CURRENT_RUN_ID, reference: "incomplete" });

      expect(
        await screen.findByText("Only completed Runs can be compared."),
      ).toBeInTheDocument();
    });

    it("says Benchmarks are unavailable when the capability is off", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/comparisons/default",
        json(capabilityOffBody(), 404),
      );
      renderView();

      expect(
        await screen.findByRole("heading", {
          name: "Benchmarks are not available",
        }),
      ).toBeInTheDocument();
    });

    it("offers a retry when the API cannot be reached", async () => {
      stub.on("GET", "/v1/benchmarks/comparisons/default", networkFailure());
      renderView();

      expect(
        await screen.findByRole("heading", {
          name: "Benchmark API unreachable",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("says so when there is no Run to compare with", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/comparisons/default",
        json({ current: runListItem(), reference: null, comparison: null }),
      );
      renderView();

      expect(
        await screen.findByText(/No reference Run to compare with/),
      ).toBeInTheDocument();
    });
  });
});
