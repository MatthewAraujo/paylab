import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/current-capabilities", () => ({
  currentCapabilities: { benchmarks: true },
}));

import TrendsPage, { metadata } from "./page";

describe("Historical trends frame", () => {
  it("has its own heading and title", async () => {
    render(await TrendsPage());

    expect(
      screen.getByRole("heading", { name: "Historical trends", level: 1 }),
    ).toBeInTheDocument();
    expect(metadata).toMatchObject({ title: "Historical trends" });
  });
});
