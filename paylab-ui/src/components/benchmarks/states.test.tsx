import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  BenchmarkEmpty,
  BenchmarkLoading,
  BenchmarkUnavailable,
  BenchmarkUnreachable,
  RefreshFailedNotice,
  SkippedRecordsNotice,
} from "./states";

function expectNoRunControls() {
  expect(
    screen.queryByRole("button", {
      name: /\b(run|start|cancel|pause|stop)\b/i,
    }),
  ).not.toBeInTheDocument();
}

describe("BenchmarkUnavailable", () => {
  it("explains that Benchmarks are a local development capability", () => {
    render(<BenchmarkUnavailable />);

    expect(
      screen.getByRole("heading", { name: "Benchmarks are not available" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/local development/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("BenchmarkUnreachable", () => {
  it("offers a retry and calls it", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<BenchmarkUnreachable onRetry={onRetry} />);

    expect(
      screen.getByRole("heading", { name: "Benchmark API unreachable" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expectNoRunControls();
  });
});

describe("BenchmarkLoading", () => {
  it("is a polite busy status with a label", () => {
    render(<BenchmarkLoading label="Loading Runs" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading Runs");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

describe("BenchmarkEmpty", () => {
  it("points to the terminal and never offers to start a Run", () => {
    render(<BenchmarkEmpty />);

    expect(
      screen.getByRole("heading", { name: "No Benchmark Runs yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/terminal/i)).toBeInTheDocument();
    expectNoRunControls();
  });

  it("accepts a specific message", () => {
    render(<BenchmarkEmpty title="No history" description="Nothing here." />);

    expect(
      screen.getByRole("heading", { name: "No history" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });
});

describe("RefreshFailedNotice", () => {
  it("keeps the data on screen and says when it was last refreshed", () => {
    render(<RefreshFailedNotice lastUpdated="2026-09-23 10:00:00 UTC" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Refresh failed. Showing data from 2026-09-23 10:00:00 UTC.",
    );
  });

  it("works without a known time", () => {
    render(<RefreshFailedNotice />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Refresh failed. Showing the last data received.",
    );
  });
});

describe("SkippedRecordsNotice", () => {
  it("counts skipped records with correct plural", () => {
    const { rerender } = render(<SkippedRecordsNotice count={1} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 stored Run record was skipped because it could not be read.",
    );

    rerender(<SkippedRecordsNotice count={3} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 stored Run records were skipped because they could not be read.",
    );
  });

  it("renders nothing when none were skipped", () => {
    const { container } = render(<SkippedRecordsNotice count={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
