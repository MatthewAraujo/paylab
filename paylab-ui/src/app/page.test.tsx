import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "./(console)/dashboard/page";

describe("PayLab Dashboard", () => {
  it("identifies the reporting contract as incomplete", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Reporting contract is incomplete" }),
    ).toBeInTheDocument();
  });
});
