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
  artifactContent,
  capabilityOffBody,
  notFoundBody,
} from "@/test/benchmark-fixtures";
import { ArtifactViewerDialog } from "./artifact-viewer-dialog";

const baseUrl = "http://api.test";
const runId = "2026-09-23T10-00-00Z-abc1234";
const artifactId = "t14.load.M.c64.sync-on-log";
const contentPath = `/v1/benchmarks/runs/:runId/artifacts/:artifactId/content`;

let stub: BenchmarkApiStub;

beforeEach(() => {
  stub = createBenchmarkApiStub().install();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderViewer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ArtifactViewerDialog
        runId={runId}
        artifactId={artifactId}
        label="t14 sync-on log"
        baseUrl={baseUrl}
      >
        Open log
      </ArtifactViewerDialog>
    </QueryClientProvider>,
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open log" }));
  return screen.findByRole("dialog");
}

describe("ArtifactViewerDialog", () => {
  it("reads nothing until it is opened", () => {
    stub.on("GET", contentPath, json(artifactContent()));

    renderViewer();

    expect(stub.requests).toHaveLength(0);
  });

  it("opens, names the Artifact and shows the first chunk as text", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();

    const dialog = await open(user);

    expect(
      within(dialog).getByRole("heading", { name: "t14 sync-on log" }),
    ).toBeInTheDocument();
    const log = await within(dialog).findByRole("region", {
      name: /log text/i,
    });
    expect(log).toHaveTextContent("started");
    expect(log).toHaveTextContent("block rep=1/3");
    expect(stub.requests[0].path).toBe(
      `/v1/benchmarks/runs/${runId}/artifacts/${artifactId}/content`,
    );
    expect(stub.requests[0].query.get("offset")).toBe("0");
    expect(within(dialog).getByText(/retained locally/i)).toBeInTheDocument();
  });

  it("renders markup literally, never as HTML", async () => {
    stub.on(
      "GET",
      contentPath,
      json(
        artifactContent({
          content: '<img src=x onerror="alert(1)"><b>bold</b>\n',
        }),
      ),
    );
    const user = userEvent.setup();
    renderViewer();

    const dialog = await open(user);

    const log = await within(dialog).findByRole("region", {
      name: /log text/i,
    });
    expect(log).toHaveTextContent('<img src=x onerror="alert(1)"><b>bold</b>');
    expect(log.querySelector("img, b")).toBeNull();
  });

  it("loads more only on request, following nextOffset, until the end", async () => {
    stub.on("GET", contentPath, ({ query }) =>
      query.get("offset") === "0"
        ? json(artifactContent({ content: "one\n", nextOffset: 4 }))
        : json(
            artifactContent({ content: "two\n", offset: 4, nextOffset: null }),
          ),
    );
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    await within(dialog).findByText(/one/);
    expect(stub.requests).toHaveLength(1);
    expect(within(dialog).getByText(/more to load/i)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /load more/i }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByRole("region", { name: /log text/i }),
      ).toHaveTextContent(/one\s+two/),
    );
    expect(stub.requests[1].query.get("offset")).toBe("4");
    expect(
      within(dialog).queryByRole("button", { name: /load more/i }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/end of file/i)).toBeInTheDocument();
  });

  it("toggles line wrapping", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);
    const log = await within(dialog).findByRole("region", {
      name: /log text/i,
    });
    const toggle = within(dialog).getByRole("checkbox", {
      name: /wrap lines/i,
    });
    expect(toggle).not.toBeChecked();
    expect(log.querySelector("pre")).toHaveClass("whitespace-pre");

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(log.querySelector("pre")).toHaveClass("whitespace-pre-wrap");
  });

  it("copies the loaded text and says so", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);
    await within(dialog).findByText(/block rep=1\/3/);

    await user.click(
      within(dialog).getByRole("button", { name: /copy loaded text/i }),
    );

    expect(await navigator.clipboard.readText()).toBe(
      "started\nblock rep=1/3\n",
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /copied loaded text/i,
    );
  });

  it("says so when the browser refuses to copy", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    renderViewer();
    const dialog = await open(user);
    await within(dialog).findByText(/block rep=1\/3/);

    await user.click(
      within(dialog).getByRole("button", { name: /copy loaded text/i }),
    );

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /could not copy/i,
    );
  });

  it("offers the complete file as a download link to the API", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    const link = await within(dialog).findByRole("link", {
      name: /download complete file/i,
    });

    expect(link).toHaveAttribute(
      "href",
      `${baseUrl}/v1/benchmarks/runs/${runId}/artifacts/${artifactId}/download`,
    );
  });

  it("explains a listed file that is no longer on this machine", async () => {
    stub.on(
      "GET",
      contentPath,
      json(notFoundBody("BENCHMARK_ARTIFACT_UNAVAILABLE"), 404),
    );
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    expect(
      await within(dialog).findByText(/not on this machine/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("link", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("explains an Artifact the API does not know", async () => {
    stub.on(
      "GET",
      contentPath,
      json(notFoundBody("BENCHMARK_ARTIFACT_NOT_FOUND"), 404),
    );
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    expect(
      await within(dialog).findByText(/artifact was not found/i),
    ).toBeInTheDocument();
  });

  it("explains that benchmarks are off when the capability is disabled", async () => {
    stub.on("GET", contentPath, json(capabilityOffBody(), 404));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    expect(
      await within(dialog).findByText(/benchmarks are not available/i),
    ).toBeInTheDocument();
  });

  it("offers a retry when the API cannot be reached", async () => {
    stub.on("GET", contentPath, networkFailure());
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);
    expect(
      await within(dialog).findByText(/api unreachable/i),
    ).toBeInTheDocument();

    stub.on("GET", contentPath, json(artifactContent()));
    await user.click(within(dialog).getByRole("button", { name: /retry/i }));

    expect(
      await within(dialog).findByText(/block rep=1\/3/),
    ).toBeInTheDocument();
  });

  it("shows a busy state while the first chunk loads", async () => {
    stub.on("GET", contentPath, () => new Promise<Response>(() => {}));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    expect(within(dialog).getByRole("status")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("moves focus into the dialog and back to the trigger on Escape", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();
    const trigger = screen.getByRole("button", { name: "Open log" });
    const dialog = await open(user);

    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("lets keyboard users scroll the log", async () => {
    stub.on("GET", contentPath, json(artifactContent()));
    const user = userEvent.setup();
    renderViewer();
    const dialog = await open(user);

    const log = await within(dialog).findByRole("region", {
      name: /log text/i,
    });

    expect(log).toHaveAttribute("tabindex", "0");
  });
});
