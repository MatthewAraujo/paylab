import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { trend } from "@/test/benchmark-fixtures";
import { TrendTable } from "./trend-table";

const details = new Map([
  ["a", { commit: "3f9d0aa1234567", note: "Before the index" }],
  ["b", { commit: "8a2c91f7654321", note: undefined }],
]);

const at = (n: number) => `2026-09-${String(n).padStart(2, "0")}T12:00:00.000Z`;

function rowsOf() {
  return screen.getAllByRole("row").slice(1);
}

describe("TrendTable", () => {
  it("lists run, value, commit, time and note for every point", () => {
    render(
      <TrendTable
        trend={trend({
          points: [
            { runId: "a", startedAt: at(1), kind: "native", value: 1234.5 },
            { runId: "b", startedAt: at(2), kind: "native", value: 20 },
          ],
        })}
        details={details}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Run", "Value", "Commit", "Time", "Note"]);
    const [first, second] = rowsOf();
    expect(first).toHaveTextContent("a");
    expect(first).toHaveTextContent("1,234.5 tx/s");
    expect(first).toHaveTextContent("3f9d0aa");
    expect(first).toHaveTextContent("2026-09-01 12:00:00 UTC");
    expect(first).toHaveTextContent("Before the index");
    expect(second).toHaveTextContent("8a2c91f");
    expect(second).toHaveTextContent("Not recorded");
  });

  it("states the metric, unit and direction in the caption", () => {
    render(<TrendTable trend={trend()} details={details} />);

    expect(screen.getByRole("table")).toHaveAccessibleName(
      /Settlements per second.*tx\/s.*Higher is better/,
    );
  });

  it("links each Run to its detail", () => {
    render(
      <TrendTable
        trend={trend({
          points: [{ runId: "a", startedAt: at(1), kind: "native", value: 1 }],
        })}
        details={details}
      />,
    );

    expect(screen.getByRole("link", { name: "a" })).toHaveAttribute(
      "href",
      "/benchmarks/runs/a",
    );
  });

  it("says Baseline and Imported in words", () => {
    render(
      <TrendTable
        trend={trend({
          points: [
            { runId: "a", startedAt: at(1), kind: "imported", value: 1 },
            { runId: "b", startedAt: at(2), kind: "native", value: 2 },
          ],
          baselineRunId: "b",
        })}
        details={details}
      />,
    );

    const [first, second] = rowsOf();
    expect(within(first).getByText("Imported")).toBeInTheDocument();
    expect(within(second).getByText("Baseline")).toBeInTheDocument();
    expect(within(first).queryByText("Baseline")).not.toBeInTheDocument();
  });

  it("lists Incomplete Runs without a value and Runs left out with the reason", () => {
    render(
      <TrendTable
        trend={trend({
          points: [{ runId: "a", startedAt: at(1), kind: "native", value: 1 }],
          incompleteRuns: [
            {
              runId: "b",
              startedAt: at(2),
              failureSummary: "Scenario t14 exited with status 1",
            },
          ],
          excluded: [
            { runId: "c", startedAt: at(3), reason: "dataset-incompatible" },
          ],
        })}
        details={details}
      />,
    );

    const [, incomplete, excluded] = rowsOf();
    expect(incomplete).toHaveTextContent("Incomplete Run");
    expect(incomplete).toHaveTextContent("No value");
    expect(incomplete).toHaveTextContent("Scenario t14 exited with status 1");
    expect(excluded).toHaveTextContent("Left out: Different dataset");
    expect(excluded).not.toHaveTextContent("tx/s");
  });

  it("shows a Run that is not in the Run list without inventing a commit", () => {
    render(
      <TrendTable
        trend={trend({
          points: [
            { runId: "zzz", startedAt: at(1), kind: "native", value: 1 },
          ],
        })}
        details={new Map()}
      />,
    );

    expect(rowsOf()[0]).toHaveTextContent("Not recorded");
  });
});
