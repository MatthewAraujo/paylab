import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BenchmarksSubNav } from "./benchmarks-sub-nav";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("BenchmarksSubNav", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/benchmarks");
  });

  it("links the three benchmark views as real routes", () => {
    render(<BenchmarksSubNav />);

    expect(
      screen.getByRole("navigation", { name: "Benchmark views" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/benchmarks",
    );
    expect(screen.getByRole("link", { name: "Comparison" })).toHaveAttribute(
      "href",
      "/benchmarks/compare",
    );
    expect(
      screen.getByRole("link", { name: "Historical trends" }),
    ).toHaveAttribute("href", "/benchmarks/trends");
  });

  it.each([
    ["/benchmarks", "Overview"],
    ["/benchmarks/compare", "Comparison"],
    ["/benchmarks/trends", "Historical trends"],
  ])("marks only the current view on %s with aria-current", (path, current) => {
    usePathname.mockReturnValue(path);
    render(<BenchmarksSubNav />);

    const marked = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent);
    expect(marked).toEqual([current]);
  });

  it("marks no view as current on a Run detail route", () => {
    usePathname.mockReturnValue("/benchmarks/runs/abc");
    render(<BenchmarksSubNav />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });
});
