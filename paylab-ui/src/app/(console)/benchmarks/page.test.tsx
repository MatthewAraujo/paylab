import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capabilities = vi.hoisted(() => ({ benchmarks: true }));

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: capabilities,
}));

import BenchmarksOverviewPage, { metadata } from "./page";

describe("Benchmarks overview frame", () => {
  beforeEach(() => {
    capabilities.benchmarks = true;
  });

  it("renders the page header, the terminal-only note, and no execution control", async () => {
    render(await BenchmarksOverviewPage());

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

    render(await BenchmarksOverviewPage());

    expect(
      screen.getByRole("heading", {
        name: /benchmarks contract is incomplete/i,
      }),
    ).toBeInTheDocument();
  });
});
