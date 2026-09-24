import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));

import RunPage, { metadata } from "./page";

describe("Benchmark Run detail frame", () => {
  it("names the Run it was opened for, in full", async () => {
    const runId = "2026-09-23T10-00-00Z-abc1234";

    render(await RunPage({ params: Promise.resolve({ runId }) }));

    expect(
      screen.getByRole("heading", { name: "Benchmark Run", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(runId).length).toBeGreaterThan(0);
    expect(metadata).toMatchObject({ title: "Benchmark Run" });
  });
});
