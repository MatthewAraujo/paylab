import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBenchmarkApiStub } from "@/test/benchmark-api-stub";
import { runPage } from "@/test/benchmark-fixtures";
import {
  LATEST_ID,
  latestItem,
  serveOverview,
} from "@/test/benchmark-fixtures-overview";

const capabilities = vi.hoisted(() => ({ benchmarks: true }));

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: capabilities,
}));

import BenchmarksOverviewPage, { metadata } from "./page";

async function renderPage() {
  const page = await BenchmarksOverviewPage();
  render(
    <QueryClientProvider client={new QueryClient()}>
      {page}
    </QueryClientProvider>,
  );
}

describe("Benchmarks overview route", () => {
  beforeEach(() => {
    capabilities.benchmarks = true;
    serveOverview(createBenchmarkApiStub().install(), {
      pages: { "": runPage({ items: [latestItem()] }) },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the latest Run inside the frame", async () => {
    await renderPage();

    const latest = await screen.findByRole("region", { name: "Latest Run" });
    expect(within(latest).getByText(LATEST_ID)).toBeInTheDocument();
  });

  it("renders the page header, the terminal-only note, and no execution control", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Benchmarks", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/started from the terminal/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /run|start|cancel|pause|retry suite/i,
      }),
    ).not.toBeInTheDocument();
    expect(metadata).toMatchObject({ title: "Benchmarks" });
  });

  it("says the contract is incomplete, never that Benchmarks are off, when OpenAPI lacks the routes", async () => {
    capabilities.benchmarks = false;

    await renderPage();

    expect(
      screen.getByRole("heading", {
        name: /benchmarks contract is incomplete/i,
      }),
    ).toBeInTheDocument();
  });
});
