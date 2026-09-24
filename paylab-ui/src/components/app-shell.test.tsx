import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("AppShell", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/dashboard");
  });

  it("provides the five MVP sections and marks the current page", () => {
    render(
      <AppShell>
        <h1>Dashboard</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Accounts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ledger" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "System Health" }),
    ).toBeInTheDocument();
  });

  it("adds Benchmarks to the primary navigation, after the financial sections", () => {
    render(
      <AppShell>
        <h1>Dashboard</h1>
      </AppShell>,
    );

    const primary = screen.getByRole("navigation", { name: "Primary" });
    const labels = within(primary)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toContain("Benchmarks");
    expect(labels.indexOf("Benchmarks")).toBeGreaterThan(
      labels.indexOf("Ledger"),
    );
    expect(screen.getByRole("link", { name: "Benchmarks" })).toHaveAttribute(
      "href",
      "/benchmarks",
    );
  });

  it.each([
    "/benchmarks",
    "/benchmarks/compare",
    "/benchmarks/trends",
    "/benchmarks/runs/2026-09-23T10-00-00Z-abc1234",
  ])("marks Benchmarks as the current section on %s", (path) => {
    usePathname.mockReturnValue(path);
    render(
      <AppShell>
        <h1>Benchmarks</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Benchmarks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("offers Benchmarks in the mobile navigation sheet too, from the same registry", async () => {
    render(
      <AppShell>
        <h1>Dashboard</h1>
      </AppShell>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open navigation" }),
    );

    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("link", { name: "Benchmarks" }),
    ).toHaveAttribute("href", "/benchmarks");
  });
});
