import { render, screen } from "@testing-library/react";
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
});
