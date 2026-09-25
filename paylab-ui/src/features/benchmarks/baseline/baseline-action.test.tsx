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
  baselineSelection,
  baselineView,
  gitState,
  notFoundBody,
  runListItem,
  validationBody,
} from "@/test/benchmark-fixtures";
import { BaselineAction } from "./baseline-action";

const RUN = "2026-09-24T10-00-00Z-abc1234";
const OLD = "2026-09-16T18-30-00Z-3f9d0aa";
const path = "/v1/benchmarks/baseline";

const putRequests = (stub: BenchmarkApiStub) =>
  stub.requests.filter((request) => request.method === "PUT");
const getRequests = (stub: BenchmarkApiStub) =>
  stub.requests.filter((request) => request.method === "GET");

function renderAction(
  props: Partial<Parameters<typeof BaselineAction>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BaselineAction
        runId={RUN}
        status="COMPLETED"
        baseUrl="http://api.test"
        {...props}
      />
    </QueryClientProvider>,
  );
}

const withOldBaseline = () =>
  baselineView({
    baseline: { runId: OLD, selectedAt: "2026-09-16T19:00:00.000Z" },
    run: runListItem({ runId: OLD }),
  });

describe("BaselineAction", () => {
  let stub: BenchmarkApiStub;

  beforeEach(() => {
    stub = createBenchmarkApiStub().install();
    stub.on("GET", path, () => json(withOldBaseline()));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const trigger = () =>
    screen.findByRole("button", { name: "Make this Run the Baseline" });

  it("names the current and the proposed Baseline and discloses the Git effect", async () => {
    const user = userEvent.setup();
    renderAction();
    await user.click(await trigger());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(RUN)).toBeInTheDocument();
    expect(await within(dialog).findByText(OLD)).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/reviewable Git change/i);
    expect(dialog).toHaveTextContent(/nothing is committed/i);
    expect(
      within(dialog).queryByRole("button", { name: /commit|push/i }),
    ).toBeNull();
    expect(putRequests(stub)).toHaveLength(0);
  });

  it("says when there is no Baseline yet", async () => {
    stub.on("GET", path, () => json(baselineView()));
    const user = userEvent.setup();
    renderAction();
    await user.click(await trigger());

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("No Baseline selected"),
    ).toBeInTheDocument();
  });

  it("changes nothing on cancel and returns focus to the action", async () => {
    const user = userEvent.setup();
    renderAction();
    const button = await trigger();
    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(putRequests(stub)).toHaveLength(0);
    expect(button).toHaveFocus();
  });

  it("sends only the Run id, without a credential, and shows the new Baseline with the pending files", async () => {
    stub.on("PUT", path, () =>
      json(
        baselineSelection({
          baseline: { runId: RUN, selectedAt: "2026-09-25T09:00:00.000Z" },
          run: runListItem({ runId: RUN }),
          git: gitState({
            baselineChangePending: true,
            dirtyFiles: ["bench/baseline.json", "bench/results/a.json"],
            dirtyCount: 5,
          }),
        }),
      ),
    );
    const user = userEvent.setup();
    renderAction();
    await user.click(await trigger());
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Make Baseline" }),
    );

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      `The Baseline is now ${RUN}`,
    );
    expect(dialog).toHaveTextContent("bench/baseline.json");
    expect(dialog).toHaveTextContent("bench/results/a.json");
    expect(dialog).toHaveTextContent(/5 files/);
    expect(dialog).toHaveTextContent(/and 3 more/);
    expect(dialog).toHaveTextContent(/next benchmark run .*refuse/i);

    const [request] = putRequests(stub);
    expect(request.body).toEqual({ runId: RUN });
    expect(request.headers.get("authorization")).toBeNull();
  });

  it("refreshes the Baseline after a successful selection", async () => {
    stub.on("PUT", path, () =>
      json(
        baselineSelection({
          baseline: { runId: RUN, selectedAt: "2026-09-25T09:00:00.000Z" },
        }),
      ),
    );
    const user = userEvent.setup();
    renderAction();
    await user.click(await trigger());
    const before = getRequests(stub).length;
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Make Baseline",
      }),
    );

    await waitFor(() =>
      expect(getRequests(stub).length).toBeGreaterThan(before),
    );
  });

  it("reports no change when the Run already was the Baseline", async () => {
    stub.on("PUT", path, () =>
      json(
        baselineSelection({
          changed: false,
          git: gitState(),
          baseline: { runId: RUN, selectedAt: "2026-09-25T09:00:00.000Z" },
          run: runListItem({ runId: RUN }),
        }),
      ),
    );
    const user = userEvent.setup();
    renderAction();
    await user.click(await trigger());
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Make Baseline" }),
    );

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      /no change/i,
    );
    expect(dialog).not.toHaveTextContent(/pending/i);
  });

  it.each([
    [
      "an ineligible Run",
      () =>
        json(
          validationBody(
            "BENCHMARK_BASELINE_INELIGIBLE",
            "Only completed Runs can be the Baseline.",
          ),
          422,
        ),
      "Only completed Runs can be the Baseline.",
    ],
    [
      "an unknown Run",
      () => json(notFoundBody("BENCHMARK_RUN_NOT_FOUND", "No such Run."), 404),
      "No such Run.",
    ],
    ["an unreachable API", networkFailure(), /not reachable|failed to fetch/i],
  ])(
    "keeps the previous Baseline and says why for %s",
    async (_name, responder, reason) => {
      stub.on("PUT", path, responder);
      const user = userEvent.setup();
      renderAction();
      await user.click(await trigger());
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Make Baseline" }),
      );

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent(reason);
      expect(alert).toHaveTextContent(new RegExp(`Baseline is still ${OLD}`));
    },
  );

  it("explains instead of offering the action for a running or incomplete Run", async () => {
    renderAction({ status: "INCOMPLETE" });

    expect(
      await screen.findByText(/only a completed Run can become the Baseline/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Make this Run the Baseline/ }),
    ).toBeDisabled();
  });

  it("is absent when the Run already is the Baseline", async () => {
    stub.on("GET", path, () =>
      json(
        baselineView({
          baseline: { runId: RUN, selectedAt: "2026-09-16T19:00:00.000Z" },
          run: runListItem({ runId: RUN }),
        }),
      ),
    );
    renderAction();

    await waitFor(() => expect(getRequests(stub).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /Baseline/ })).toBeNull();
  });

  it("says the selection is unavailable when the API contract lacks it", async () => {
    renderAction({ enabled: false });

    expect(
      await screen.findByText(/not available on this API/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Baseline/ })).toBeNull();
  });

  it("uses a custom label for the Run it acts on", async () => {
    renderAction({ label: "Make the reference Run the Baseline" });

    expect(
      await screen.findByRole("button", {
        name: "Make the reference Run the Baseline",
      }),
    ).toBeInTheDocument();
  });
});
