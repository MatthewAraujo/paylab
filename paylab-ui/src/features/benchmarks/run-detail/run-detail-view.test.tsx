import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BenchmarkApiStub,
  createBenchmarkApiStub,
  json,
  networkFailure,
} from "@/test/benchmark-api-stub";
import {
  artifactContent,
  baselineView,
  capabilityOffBody,
  notFoundBody,
  runListItem,
} from "@/test/benchmark-fixtures";
import {
  INCOMPLETE_RUN_ID,
  importedRun,
  incompleteRun,
  largeConcurrencyRun,
  NATIVE_RUN_ID,
  nativeCompletedRun,
} from "@/test/benchmark-fixtures-detail";
import { RunDetailView } from "./run-detail-view";

function renderView(
  runId: string,
  props: Partial<Parameters<typeof RunDetailView>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    wrapper(
      <RunDetailView runId={runId} baseUrl="http://api.test" {...props} />,
    ),
  );
}

describe("the Run detail", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    stub = createBenchmarkApiStub().install();
    stub.on("GET", "/v1/benchmarks/baseline", json(baselineView()));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(body: unknown, status = 200) {
    stub.on("GET", "/v1/benchmarks/runs/:runId", json(body, status));
  }

  describe("of a completed native Run", () => {
    beforeEach(() => serve(nativeCompletedRun()));

    it("shows identity, timing, provenance, environment and dataset", async () => {
      renderView(NATIVE_RUN_ID);

      expect(
        await screen.findByRole("heading", { name: "Identity and provenance" }),
      ).toBeInTheDocument();
      expect(screen.getByText("COMPLETED")).toBeInTheDocument();
      expect(screen.getByText("Native")).toBeInTheDocument();
      expect(
        screen.getByText("After adding the settlement lookup index"),
      ).toBeInTheDocument();
      expect(screen.getByText("2026-09-23 14:08:12 UTC")).toBeInTheDocument();
      expect(screen.getByText("2026-09-23 15:26:36 UTC")).toBeInTheDocument();
      expect(screen.getByText("78m 24s")).toBeInTheDocument();
      expect(screen.getByText("8a2c91f")).toBeInTheDocument();
      expect(screen.getByText("feature/settlement-index")).toBeInTheDocument();
      expect(screen.getByText("Executor version")).toBeInTheDocument();
      expect(screen.getByText("Summary schema version")).toBeInTheDocument();
      expect(screen.getByText("24.5.0")).toBeInTheDocument();
      expect(screen.getByText("16.15")).toBeInTheDocument();
      expect(
        screen.getByText("1001000 payments, 1000 wallets, 50 merchants"),
      ).toBeInTheDocument();
    });

    it("groups scenarios by group and states each protocol", async () => {
      renderView(NATIVE_RUN_ID);

      await screen.findByRole("heading", { name: "Scenarios" });
      expect(
        screen.getByRole("button", {
          name: /Reads and index behavior \(T13\)/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Concurrency and load \(T14\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("2 warm-up runs · 5 repetitions · median"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Warm-up 2 s · Duration 10 s · 3 repetitions · median",
        ),
      ).toBeInTheDocument();
    });

    it("lists every metric with unit, direction, aggregation and dimensions", async () => {
      renderView(NATIVE_RUN_ID);

      const table = await screen.findByRole("table", {
        name: "Metrics of Concurrency strategies: shape M, 64 clients, synchronous_commit=on",
      });
      const rows = within(table).getAllByRole("row");
      // header + 4 measured metrics + the unknown future one
      expect(rows).toHaveLength(6);
      expect(within(table).getAllByText("strategy: nokey")).toHaveLength(2);
      expect(within(table).getAllByText("strategy: keyed")).toHaveLength(2);
      expect(within(table).getByText("164.4")).toBeInTheDocument();
      expect(within(table).getAllByText("Higher is better")).toHaveLength(2);
      expect(within(table).getAllByText("Lower is better")).toHaveLength(2);
    });

    it("renders an unknown future metric generically and a missing value as not recorded", async () => {
      renderView(NATIVE_RUN_ID);

      const row = (await screen.findByText("Future gauge")).closest("tr");
      expect(row).not.toBeNull();
      const cells = within(row as HTMLElement);
      expect(cells.getByText("7")).toBeInTheDocument();
      expect(cells.getByText("widgets")).toBeInTheDocument();
      expect(cells.getByText("Informational")).toBeInTheDocument();
      // no aggregation was recorded for it
      expect(cells.getByText("Not recorded")).toBeInTheDocument();
    });

    it("scrolls wide tables inside a labelled, focusable region", async () => {
      renderView(NATIVE_RUN_ID);

      const region = await screen.findByRole("region", {
        name: "Metrics of Balance (hot Wallet), scrollable",
      });
      expect(region).toHaveAttribute("tabindex", "0");
    });
  });

  describe("of a large concurrency Run", () => {
    beforeEach(() => serve(largeConcurrencyRun()));

    it("keeps groups and scenarios collapsed until they are opened", async () => {
      const user = userEvent.setup();
      renderView(NATIVE_RUN_ID);

      const group = await screen.findByRole("button", {
        name: /Concurrency and load \(T14\)/,
      });
      expect(group).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Concurrency case 0")).not.toBeInTheDocument();
      expect(screen.queryAllByRole("row")).toHaveLength(0);

      await user.click(group);
      const scenarioToggle = screen.getByRole("button", {
        name: /Concurrency case 0/,
      });
      expect(
        screen.getAllByRole("button", { name: /Concurrency case/ }),
      ).toHaveLength(20);
      // the group is open but no metric row is laid out yet
      expect(screen.queryAllByRole("row")).toHaveLength(0);

      await user.click(scenarioToggle);
      expect(screen.getAllByRole("row")).toHaveLength(11);
      expect(screen.getByText("Metric 0.9")).toBeInTheDocument();
      expect(screen.queryByText("Metric 1.0")).not.toBeInTheDocument();
    });
  });

  describe("of an Incomplete Run", () => {
    beforeEach(() => serve(incompleteRun()));

    it("shows the failure, then the diagnostic measurements, then the Artifacts", async () => {
      renderView(INCOMPLETE_RUN_ID);

      const failure = await screen.findByRole("heading", {
        name: "Failure evidence",
      });
      const diagnostic = screen.getByRole("heading", {
        name: "Diagnostic measurements completed before failure",
      });
      const artifacts = screen.getByRole("heading", { name: "Artifacts" });
      const follows = (a: HTMLElement, b: HTMLElement) =>
        Boolean(
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      expect(follows(failure, diagnostic)).toBe(true);
      expect(follows(diagnostic, artifacts)).toBe(true);

      const evidence = failure.closest("section") as HTMLElement;
      expect(
        within(evidence).getByText("t14.load.H.c16.sync-off"),
      ).toBeInTheDocument();
      expect(
        within(evidence).getByText("pnpm bench:load --shape H --clients 16"),
      ).toBeInTheDocument();
      expect(within(evidence).getByText("137")).toBeInTheDocument();
      expect(
        within(evidence).getByText(
          "Scenario t14.load.H.c16.sync-off exited with status 137",
        ),
      ).toBeInTheDocument();
      expect(
        within(evidence).getByText("2026-09-22 09:20:00 UTC"),
      ).toBeInTheDocument();
    });

    it("says the diagnostic measurements cannot be compared or become the Baseline", async () => {
      renderView(INCOMPLETE_RUN_ID);

      const heading = await screen.findByRole("heading", {
        name: "Diagnostic measurements completed before failure",
      });
      const section = heading.closest("section") as HTMLElement;
      expect(
        within(section).getByText(/cannot be compared or become the Baseline/),
      ).toBeInTheDocument();
      // only the scenarios that completed carry measurements
      expect(
        within(section).getByText("Balance (hot Wallet)"),
      ).toBeInTheDocument();
      expect(
        within(section).queryByText(/shape H, 16 clients/),
      ).not.toBeInTheDocument();
    });

    it("offers no comparison, no Baseline action and no overall classification", async () => {
      renderView(INCOMPLETE_RUN_ID);

      await screen.findByRole("heading", { name: "Failure evidence" });
      expect(screen.queryByRole("link", { name: /Compare/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Baseline/ })).toBeNull();
      expect(screen.queryByText(/Improved|Regressed|Stable/)).toBeNull();
      expect(stub.requests.map((request) => request.path)).not.toContain(
        "/v1/benchmarks/baseline",
      );
    });

    it("describes a failure without an exit status as an interruption", async () => {
      serve(
        incompleteRun({
          failure: {
            scenarioId: "t14.load.H.c16.sync-off",
            summary: "Interrupted while running t14.load.H.c16.sync-off",
          },
        }),
      );
      renderView(INCOMPLETE_RUN_ID);

      expect(
        await screen.findByText(/No exit status recorded/),
      ).toBeInTheDocument();
    });
  });

  describe("of an Imported record", () => {
    it.each([
      ["t13-baseline", "docs/experiments/T13-results.md#baseline"],
      ["t13-adopted", "docs/experiments/T13-results.md#adopted"],
      ["t14", "docs/experiments/T14-results.md"],
    ] as const)(
      "shows the %s record with its own provenance",
      async (kind, source) => {
        const run = importedRun(kind);
        serve(run);
        renderView(run.runId);

        expect(await screen.findByText("Imported")).toBeInTheDocument();
        expect(screen.getByText("COMPLETED")).toBeInTheDocument();
        expect(screen.getAllByText(source).length).toBeGreaterThan(0);
        expect(
          screen.getByText(/predates the benchmark executor/),
        ).toBeInTheDocument();
        expect(screen.getByText("Commit not recorded")).toBeInTheDocument();
        expect(screen.getByText("Branch not recorded")).toBeInTheDocument();
      },
    );
  });

  describe("Artifact inventory", () => {
    beforeEach(() => serve(nativeCompletedRun()));

    it("lists kind, label, scenario, size and availability", async () => {
      renderView(NATIVE_RUN_ID);

      const table = await screen.findByRole("table", {
        name: "Artifacts of this Run",
      });
      expect(
        within(table).getByText("t14.load.M.c64.sync-on log"),
      ).toBeInTheDocument();
      expect(within(table).getByText("Log")).toBeInTheDocument();
      expect(within(table).getByText("Query plan")).toBeInTheDocument();
      expect(within(table).getByText("Raw data")).toBeInTheDocument();
      expect(within(table).getByText("2.0 KB")).toBeInTheDocument();
      expect(within(table).getByText("3.2 MB")).toBeInTheDocument();
      expect(within(table).getAllByText("Available")).toHaveLength(2);
      expect(
        within(table).getByText("Not available on this machine"),
      ).toBeInTheDocument();
    });

    it("opens the Artifact viewer from an available row and offers none for a missing file", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs/:runId/artifacts/:artifactId/content",
        json(artifactContent({ content: "block rep=1/3\n" })),
      );
      const user = userEvent.setup();
      renderView(NATIVE_RUN_ID);

      const table = await screen.findByRole("table", {
        name: "Artifacts of this Run",
      });
      expect(within(table).getByText("Action")).toBeInTheDocument();
      const available = nativeCompletedRun().artifacts.filter(
        (a) => a.available,
      );
      const missing = nativeCompletedRun().artifacts.filter(
        (a) => !a.available,
      );
      expect(
        within(table).getAllByRole("button", { name: /^View / }),
      ).toHaveLength(available.length);
      expect(missing.length).toBeGreaterThan(0);

      await user.click(
        within(table).getByRole("button", {
          name: `View ${available[0].label}`,
        }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(await within(dialog).findByText(/block rep=1\/3/)).toBeVisible();
    });

    it("renders the action slot for every row when one is provided", async () => {
      renderView(NATIVE_RUN_ID, {
        renderArtifactAction: (artifact) => (
          <button type="button">View {artifact.id}</button>
        ),
      });

      expect(
        await screen.findByRole("button", {
          name: "View t14.load.M.c64.sync-on-log",
        }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(3);
    });

    it("shows the evidence file of an Imported Artifact", async () => {
      const run = importedRun("t14");
      serve(run);
      renderView(run.runId);

      expect(await screen.findByText("Recorded evidence")).toBeInTheDocument();
      expect(
        screen.getAllByText("docs/experiments/T14-results.md").length,
      ).toBeGreaterThan(1);
    });
  });

  describe("shortcuts and the Baseline slot", () => {
    beforeEach(() => serve(nativeCompletedRun()));

    it("links to the comparison with the previous compatible Run", async () => {
      renderView(NATIVE_RUN_ID);

      const link = await screen.findByRole("link", {
        name: "Compare with the previous compatible Run",
      });
      expect(link).toHaveAttribute(
        "href",
        `/benchmarks/compare?current=${NATIVE_RUN_ID}`,
      );
    });

    it("links to the comparison with the Baseline when another Run is the Baseline", async () => {
      const baselineId = "2026-09-16T18-30-00Z-3f9d0aa";
      stub.on(
        "GET",
        "/v1/benchmarks/baseline",
        json(
          baselineView({
            baseline: {
              runId: baselineId,
              selectedAt: "2026-09-17T00:00:00.000Z",
            },
            run: runListItem({ runId: baselineId }),
          }),
        ),
      );
      renderView(NATIVE_RUN_ID);

      const link = await screen.findByRole("link", {
        name: "Compare with the Baseline",
      });
      expect(link).toHaveAttribute(
        "href",
        `/benchmarks/compare?current=${NATIVE_RUN_ID}&reference=${baselineId}`,
      );
    });

    it("says so when this Run is the Baseline, or there is none", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/baseline",
        json(
          baselineView({
            baseline: {
              runId: NATIVE_RUN_ID,
              selectedAt: "2026-09-17T00:00:00.000Z",
            },
            run: runListItem(),
          }),
        ),
      );
      renderView(NATIVE_RUN_ID);
      expect(
        await screen.findByText("This Run is the Baseline"),
      ).toBeInTheDocument();
    });

    it("reports that no Baseline is selected", async () => {
      renderView(NATIVE_RUN_ID);
      expect(
        await screen.findByText("No Baseline selected"),
      ).toBeInTheDocument();
    });

    it("offers the Baseline selection with its confirmation", async () => {
      const user = userEvent.setup();
      renderView(NATIVE_RUN_ID);

      await user.click(
        await screen.findByRole("button", {
          name: /Make this Run the Baseline/,
        }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(NATIVE_RUN_ID);
      expect(dialog).toHaveTextContent(/reviewable Git change/i);
    });

    it("explains that the selection is unavailable when the contract lacks the write", async () => {
      renderView(NATIVE_RUN_ID, { baselineWrite: false });

      expect(
        await screen.findByText(/not available on this API/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Make this Run the Baseline/ }),
      ).toBeNull();
    });

    it("renders the Baseline action it is given instead", async () => {
      renderView(NATIVE_RUN_ID, {
        baselineAction: <button type="button">Select as Baseline</button>,
      });

      expect(
        await screen.findByRole("button", { name: "Select as Baseline" }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: /Make this Run the Baseline/ }),
      ).toBeNull();
    });
  });

  describe("states", () => {
    it("shows a busy placeholder while loading", () => {
      serve(nativeCompletedRun());
      renderView(NATIVE_RUN_ID);

      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    });

    it("says an unknown Run was not found and names it", async () => {
      serve(notFoundBody("BENCHMARK_RUN_NOT_FOUND", "No such Run."), 404);
      renderView("does-not-exist");

      expect(
        await screen.findByRole("heading", { name: "Benchmark Run not found" }),
      ).toBeInTheDocument();
      expect(screen.getByText("does-not-exist")).toBeInTheDocument();
    });

    it("says Benchmarks are unavailable when the capability is off", async () => {
      serve(capabilityOffBody(), 404);
      renderView(NATIVE_RUN_ID);

      expect(
        await screen.findByRole("heading", {
          name: "Benchmarks are not available",
        }),
      ).toBeInTheDocument();
    });

    it("offers a retry when the API cannot be reached", async () => {
      const user = userEvent.setup();
      stub.on("GET", "/v1/benchmarks/runs/:runId", networkFailure());
      renderView(NATIVE_RUN_ID);

      expect(
        await screen.findByRole("heading", {
          name: "Benchmark API unreachable",
        }),
      ).toBeInTheDocument();

      serve(nativeCompletedRun());
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(
        await screen.findByRole("heading", { name: "Identity and provenance" }),
      ).toBeInTheDocument();
    });

    it("reports a malformed record instead of showing values as not recorded", async () => {
      stub.on(
        "GET",
        "/v1/benchmarks/runs/:runId",
        () => new Response("<html>oops</html>", { status: 200 }),
      );
      renderView(NATIVE_RUN_ID);

      expect(
        await screen.findByRole("heading", {
          name: "Benchmark record could not be read",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Not recorded")).toBeNull();
    });
  });
});
