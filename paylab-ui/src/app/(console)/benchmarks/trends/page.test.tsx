import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBenchmarkApiStub, json } from "@/test/benchmark-api-stub";
import { runPage } from "@/test/benchmark-fixtures";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/benchmarks/trends",
}));

import TrendsPage, { metadata } from "./page";

describe("Historical trends route", () => {
  beforeEach(() => {
    createBenchmarkApiStub()
      .on("GET", "/v1/benchmarks/runs", json(runPage({ items: [] })))
      .install();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has its own heading and title", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        {await TrendsPage()}
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Historical trends", level: 1 }),
    ).toBeInTheDocument();
    expect(metadata).toMatchObject({ title: "Historical trends" });
  });

  it("renders the trends view instead of the pending placeholder", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        {await TrendsPage()}
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(/no completed benchmark run/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not available in this build/i)).toBeNull();
  });
});
