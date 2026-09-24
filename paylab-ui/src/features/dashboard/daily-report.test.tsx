import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyReport } from "./daily-report";

const report = {
  from: "2026-09-01",
  to: "2026-09-02",
  items: [
    {
      date: "2026-09-01",
      status: "SUCCEEDED" as const,
      count: 2,
      volume: 300000,
    },
    { date: "2026-09-01", status: "FAILED" as const, count: 1, volume: 50 },
    {
      date: "2026-09-02",
      status: "SUCCEEDED" as const,
      count: 1,
      volume: 100000,
    },
  ],
};

describe("DailyReport", () => {
  it("summarizes the range from the report rows", () => {
    render(<DailyReport report={report} />);

    expect(
      within(
        screen.getByText("Payments").closest("div") as HTMLElement,
      ).getByText("4"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Succeeded volume").closest("div") as HTMLElement,
      ).getByText("R$4,000.00"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Failed Payments").closest("div") as HTMLElement,
      ).getByText("1"),
    ).toBeInTheDocument();
  });

  it("shows one row per day and status with count and BRL volume", () => {
    render(<DailyReport report={report} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("2026-09-01")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Succeeded")).toBeInTheDocument();
    expect(within(rows[0]).getByText("R$3,000.00")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Failed")).toBeInTheDocument();
  });

  it("says the range is empty instead of showing zeros as data", () => {
    render(<DailyReport report={{ ...report, items: [] }} />);

    expect(screen.getByText("No Payments in this period")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
