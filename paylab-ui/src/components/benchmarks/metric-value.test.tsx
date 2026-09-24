import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricValue } from "./metric-value";

describe("MetricValue", () => {
  it("keeps the unit attached to the value", () => {
    render(<MetricValue value="164.4" unit="tx/s" />);

    expect(screen.getByText("164.4")).toBeInTheDocument();
    expect(screen.getByText("tx/s")).toBeInTheDocument();
  });

  it("shows a measured zero as zero", () => {
    render(<MetricValue value="0" unit="deadlocks" />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it.each([null, undefined])(
    "shows an absent value as not recorded, never as zero (%s)",
    (value) => {
      render(<MetricValue value={value} unit="ms" />);

      expect(screen.getByText("Not recorded")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
      expect(screen.queryByText("ms")).not.toBeInTheDocument();
    },
  );
});
