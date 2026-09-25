import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { trend } from "@/test/benchmark-fixtures";
import { denseTrend } from "@/test/benchmark-fixtures-trends";
import { TrendChart } from "./trend-chart";

const day = (n: number) =>
  `2026-09-${String(n).padStart(2, "0")}T12:00:00.000Z`;
const point = (runId: string, n: number, value: number, kind = "native") => ({
  runId,
  startedAt: day(n),
  kind: kind as "native" | "imported",
  value,
});

function markers(container: HTMLElement, type: string) {
  return container.querySelectorAll(`[data-entry="${type}"]`);
}

describe("TrendChart", () => {
  it("is an image with a text alternative naming the metric, unit, direction and range", () => {
    render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10), point("b", 2, 20)],
        })}
      />,
    );

    const chart = screen.getByRole("img", {
      name: /Settlements per second/,
    });
    expect(chart).toHaveAccessibleName(/tx\/s/);
    expect(chart).toHaveAccessibleDescription(/2 values/);
    expect(chart).toHaveAccessibleDescription(/Higher is better/);
    expect(chart).toHaveAccessibleDescription(/table below/i);
  });

  it("plots one marker per point, joined by a single straight line", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10), point("b", 2, 20), point("c", 3, 15)],
          excluded: [],
        })}
      />,
    );

    expect(markers(container, "point")).toHaveLength(3);
    const lines = container.querySelectorAll("polyline");
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute("points")?.trim().split(" ")).toHaveLength(3);
  });

  it("never joins across a Run that was left out", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10), point("b", 2, 20), point("d", 4, 30)],
          excluded: [{ runId: "c", startedAt: day(3), reason: "changed" }],
        })}
      />,
    );

    expect(markers(container, "excluded")).toHaveLength(1);
    // Two points are joined; the point after the exclusion stands alone.
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(markers(container, "point")).toHaveLength(3);
  });

  it("marks an Incomplete Run without a value and keeps the line through it", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10), point("c", 3, 20)],
          incompleteRuns: [{ runId: "b", startedAt: day(2) }],
        })}
      />,
    );

    expect(markers(container, "incomplete")).toHaveLength(1);
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("marks the Baseline with its own shape and a text label", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10), point("b", 2, 20)],
          baselineRunId: "a",
        })}
      />,
    );

    expect(container.querySelectorAll('[data-baseline="true"]')).toHaveLength(
      1,
    );
    expect(container.querySelector("svg")).toHaveTextContent("Baseline");
  });

  it("shows no Baseline mark when the Baseline is not one of the points", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10)],
          baselineRunId: "elsewhere",
        })}
      />,
    );

    expect(container.querySelectorAll('[data-baseline="true"]')).toHaveLength(
      0,
    );
  });

  it("tells native from imported points by shape, not color", () => {
    const { container } = render(
      <TrendChart
        trend={trend({
          points: [point("a", 1, 10, "imported"), point("b", 2, 20)],
        })}
      />,
    );

    expect(container.querySelectorAll('[data-kind="imported"]')).toHaveLength(
      1,
    );
    expect(container.querySelector('[data-kind="imported"]')?.tagName).toBe(
      "rect",
    );
    expect(container.querySelector('[data-kind="native"]')?.tagName).toBe(
      "circle",
    );
  });

  it("draws a single point as a marker with no line", () => {
    const { container } = render(
      <TrendChart trend={trend({ points: [point("a", 1, 10)] })} />,
    );

    expect(markers(container, "point")).toHaveLength(1);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });

  it("labels both axes and the legend explains every mark in words", () => {
    render(
      <TrendChart
        trend={trend({ points: [point("a", 1, 10), point("b", 2, 20)] })}
      />,
    );

    expect(screen.getByText(/Run order, oldest to newest/)).toBeInTheDocument();
    expect(screen.getByText(/tx\/s/, { selector: "text" })).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Chart legend" });
    expect(legend).toHaveTextContent("Native Run");
    expect(legend).toHaveTextContent("Imported Run");
    expect(legend).toHaveTextContent("Baseline");
    expect(legend).toHaveTextContent("Incomplete Run, no value");
    expect(legend).toHaveTextContent("Left out of the line");
  });

  it("keeps a dense history readable: one slot per Run inside a keyboard-scrollable area", () => {
    const { container } = render(<TrendChart trend={denseTrend(80)} />);

    expect(markers(container, "point")).toHaveLength(80);
    expect(
      screen.getByRole("region", { name: /chart, scrollable/i }),
    ).toHaveAttribute("tabindex", "0");
  });
});
