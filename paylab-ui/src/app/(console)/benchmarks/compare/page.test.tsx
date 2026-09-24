import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));

import ComparePage, { metadata } from "./page";

describe("Benchmark Comparison frame", () => {
  it("has its own heading and title", async () => {
    render(await ComparePage());

    expect(
      screen.getByRole("heading", { name: "Benchmark Comparison", level: 1 }),
    ).toBeInTheDocument();
    expect(metadata).toMatchObject({ title: "Benchmark Comparison" });
  });
});
