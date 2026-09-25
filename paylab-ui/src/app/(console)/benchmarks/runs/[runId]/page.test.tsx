import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBenchmarkApiStub, json } from "@/test/benchmark-api-stub";
import { baselineView } from "@/test/benchmark-fixtures";
import { nativeCompletedRun } from "@/test/benchmark-fixtures-detail";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));

import RunPage, { metadata } from "./page";

describe("Benchmark Run detail route", () => {
  beforeEach(() => {
    createBenchmarkApiStub()
      .on("GET", "/v1/benchmarks/runs/:runId", ({ params }) =>
        json(nativeCompletedRun({ runId: params.runId })),
      )
      .on("GET", "/v1/benchmarks/baseline", json(baselineView()))
      .install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the Run it was opened for and shows it in full", async () => {
    const runId = "2026-09-23T10-00-00Z-abc1234";

    render(
      <QueryClientProvider client={new QueryClient()}>
        {await RunPage({ params: Promise.resolve({ runId }) })}
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Benchmark Run", level: 1 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Identity and provenance" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(runId).length).toBeGreaterThan(0);
    expect(metadata).toMatchObject({ title: "Benchmark Run" });
  });
});
