import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBenchmarkApiStub, json } from "@/test/benchmark-api-stub";
import { baselineView, runPage } from "@/test/benchmark-fixtures";
import {
  CURRENT_RUN_ID,
  comparisonFixture,
  REFERENCE_RUN_ID,
} from "@/test/benchmark-fixtures-detail";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import ComparePage, { metadata } from "./page";

describe("Benchmark Comparison route", () => {
  const fixture = comparisonFixture();

  beforeEach(() => {
    createBenchmarkApiStub()
      .on("GET", "/v1/benchmarks/comparisons", json(fixture.response))
      .on("GET", "/v1/benchmarks/comparisons/default", json(fixture.response))
      .on("GET", "/v1/benchmarks/baseline", json(baselineView()))
      .on("GET", "/v1/benchmarks/runs", json(runPage()))
      .on("GET", "/v1/benchmarks/runs/:runId", ({ params }) =>
        json(
          params.runId === CURRENT_RUN_ID ? fixture.current : fixture.reference,
        ),
      )
      .install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has its own heading and title", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        {await ComparePage({ searchParams: Promise.resolve({}) })}
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Benchmark Comparison", level: 1 }),
    ).toBeInTheDocument();
    expect(metadata).toMatchObject({ title: "Benchmark Comparison" });
    expect(
      await screen.findByRole("heading", { name: "Compatibility" }),
    ).toBeInTheDocument();
  });

  it("reads the selection from the address", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        {
          await ComparePage({
            searchParams: Promise.resolve({
              current: CURRENT_RUN_ID,
              reference: [REFERENCE_RUN_ID, "ignored"],
            }),
          })
        }
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("Reference Run")).toHaveValue(
      REFERENCE_RUN_ID,
    );
  });
});
