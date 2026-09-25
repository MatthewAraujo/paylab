import { useId } from "react";
import type { components } from "@/api/generated/schema";
import { formatInstant, formatNumber } from "../rules";
import {
  buildTimeline,
  directionLabel,
  exclusionLabel,
  lineSegments,
  valueExtent,
} from "./model";

type Trend = components["schemas"]["TrendResponse"];

const SLOT = 32;
const MIN_WIDTH = 640;
const HEIGHT = 300;
const MARGIN = { top: 34, right: 24, bottom: 62, left: 72 };
const EVENT_ROW = HEIGHT - 26;

/**
 * One metric's history as accessible SVG: position is the Run order, values are exact points,
 * and no meaning depends on color, hover or pointer. The exact values are in the table below.
 */
export function TrendChart({ trend }: Readonly<{ trend: Trend }>) {
  const titleId = useId();
  const descId = useId();
  const entries = buildTimeline(trend);
  const segments = lineSegments(entries);
  const values = trend.points.map((point) => point.value);
  const unit = trend.unit ?? "";
  const name = trend.label ?? trend.metricKey;
  const width = Math.max(
    MIN_WIDTH,
    MARGIN.left + MARGIN.right + entries.length * SLOT,
  );
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = plotWidth / Math.max(entries.length, 1);
  const { min, max } = valueExtent(values.length > 0 ? values : [0]);

  const x = (index: number) => MARGIN.left + (index + 0.5) * slot;
  const y = (value: number) =>
    MARGIN.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const first = trend.points[0];
  const last = trend.points.at(-1);
  const range =
    first && last
      ? `, from ${formatInstant(first.startedAt)} to ${formatInstant(last.startedAt)}`
      : "";
  const description = `${values.length} ${values.length === 1 ? "value" : "values"}${range}. ${directionLabel(trend.direction)}. The exact values are in the table below.`;

  return (
    <div className="space-y-3">
      <section
        aria-label="Trend chart, scrollable"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a wide chart must be scrollable by keyboard
        tabIndex={0}
        className="overflow-x-auto rounded-md border"
      >
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block text-foreground"
        >
          <title
            id={titleId}
          >{`${name}${unit ? ` (${unit})` : ""}, trend chart`}</title>
          <desc id={descId}>{description}</desc>

          {/* Axes */}
          <line
            x1={MARGIN.left}
            x2={MARGIN.left}
            y1={MARGIN.top}
            y2={MARGIN.top + plotHeight}
            className="stroke-border"
          />
          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={MARGIN.top + plotHeight}
            y2={MARGIN.top + plotHeight}
            className="stroke-border"
          />
          <text
            x={MARGIN.left - 8}
            y={MARGIN.top + 4}
            textAnchor="end"
            className="fill-muted-foreground text-xs"
          >
            {formatNumber(Number(max.toPrecision(4)))}
          </text>
          <text
            x={MARGIN.left - 8}
            y={MARGIN.top + plotHeight}
            textAnchor="end"
            className="fill-muted-foreground text-xs"
          >
            {formatNumber(Number(min.toPrecision(4)))}
          </text>
          <text
            x={MARGIN.left}
            y={16}
            className="fill-muted-foreground text-xs"
          >
            {`${name}${unit ? ` (${unit})` : ""}`}
          </text>
          <text
            x={MARGIN.left + plotWidth / 2}
            y={HEIGHT - 4}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            Run order, oldest to newest
          </text>

          {/* Straight segments; an exclusion ends one */}
          {segments
            .filter((segment) => segment.length > 1)
            .map((segment) => (
              <polyline
                key={segment[0]}
                fill="none"
                strokeWidth={2}
                className="stroke-primary"
                points={segment
                  .map((index) => {
                    const entry = entries[index];
                    return entry.type === "point"
                      ? `${x(index)},${y(entry.value)}`
                      : "";
                  })
                  .join(" ")}
              />
            ))}

          {entries.map((entry, index) => {
            const cx = x(index);
            if (entry.type === "point") {
              const cy = y(entry.value);
              const label = `${entry.runId}: ${formatNumber(entry.value)}${unit ? ` ${unit}` : ""}${entry.isBaseline ? ", Baseline" : ""}${entry.kind === "imported" ? ", Imported" : ""}`;
              return (
                <g key={`${entry.type}-${entry.runId}`}>
                  {entry.isBaseline ? (
                    <>
                      <circle
                        data-baseline="true"
                        cx={cx}
                        cy={cy}
                        r={9}
                        fill="none"
                        strokeWidth={2}
                        className="stroke-foreground"
                      />
                      <text
                        x={cx}
                        y={cy - 15}
                        textAnchor="middle"
                        className="fill-foreground text-xs font-semibold"
                      >
                        Baseline
                      </text>
                    </>
                  ) : null}
                  {entry.kind === "imported" ? (
                    <rect
                      data-entry="point"
                      data-kind="imported"
                      x={cx - 4.5}
                      y={cy - 4.5}
                      width={9}
                      height={9}
                      className="fill-background stroke-primary"
                      strokeWidth={2}
                    >
                      <title>{label}</title>
                    </rect>
                  ) : (
                    <circle
                      data-entry="point"
                      data-kind="native"
                      cx={cx}
                      cy={cy}
                      r={4.5}
                      className="fill-primary"
                    >
                      <title>{label}</title>
                    </circle>
                  )}
                </g>
              );
            }
            if (entry.type === "incomplete") {
              return (
                <path
                  key={`${entry.type}-${entry.runId}`}
                  data-entry="incomplete"
                  d={`M ${cx} ${EVENT_ROW - 6} L ${cx + 6} ${EVENT_ROW + 5} L ${cx - 6} ${EVENT_ROW + 5} Z`}
                  className="fill-destructive"
                >
                  <title>{`${entry.runId}: Incomplete Run, no value`}</title>
                </path>
              );
            }
            return (
              <path
                key={`${entry.type}-${entry.runId}`}
                data-entry="excluded"
                d={`M ${cx - 5} ${EVENT_ROW - 5} L ${cx + 5} ${EVENT_ROW + 5} M ${cx + 5} ${EVENT_ROW - 5} L ${cx - 5} ${EVENT_ROW + 5}`}
                strokeWidth={2}
                fill="none"
                className="stroke-muted-foreground"
              >
                <title>{`${entry.runId}: left out, ${exclusionLabel(entry.reason)}`}</title>
              </path>
            );
          })}
        </svg>
      </section>

      <ul
        aria-label="Chart legend"
        className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"
      >
        <li>
          <span aria-hidden="true">● </span>Native Run
        </li>
        <li>
          <span aria-hidden="true">□ </span>Imported Run
        </li>
        <li>
          <span aria-hidden="true">◎ </span>Baseline
        </li>
        <li>
          <span aria-hidden="true">▲ </span>Incomplete Run, no value
        </li>
        <li>
          <span aria-hidden="true">✕ </span>Left out of the line
        </li>
      </ul>
    </div>
  );
}
