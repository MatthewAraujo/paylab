import { formatTimestamp } from "@/lib/datetime";

/** What a missing measurement says. It is never rendered as zero. */
export const NOT_RECORDED = "Not recorded";

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/**
 * A number with thousands separators, keeping the source precision up to three decimals and
 * trimming trailing zeros ("62.1", not "62.100").
 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Value and unit together. A plain count or an empty unit shows the number alone. */
export function formatMetricValue(
  value: number | undefined,
  unit: string,
): string {
  if (value === undefined) {
    return NOT_RECORDED;
  }
  const text = formatNumber(value);
  return unit && unit !== "count" ? `${text} ${unit}` : text;
}

/** A signed change with its unit; a zero delta carries no sign. */
export function formatDelta(absoluteDelta: number, unit: string): string {
  const sign = absoluteDelta > 0 ? "+" : "";
  const text = `${sign}${formatNumber(absoluteDelta)}`;
  return unit && unit !== "count" ? `${text} ${unit}` : text;
}

/** A signed percentage with one decimal, or "Not applicable" when there is none to show. */
export function formatPercent(percent: number | null): string {
  if (percent === null) {
    return "Not applicable";
  }
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

/** Milliseconds up to a second, seconds up to a minute, then minutes and seconds ("78m 24s"). */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) {
    return NOT_RECORDED;
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60_000) {
    return `${formatNumber(Math.round(ms / 100) / 10)} s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

/** The console's existing UTC display ("2026-09-23 21:28:52 UTC"). */
export function formatInstant(iso: string): string {
  return formatTimestamp(iso);
}

/** The exact instant, normalized, for a title or a copy action next to the display form. */
export function exactInstant(iso: string): string {
  return new Date(iso).toISOString();
}

/** Seven characters of a commit hash; the unknown marker of an imported Run stays as it is. */
export function abbreviateCommit(commit: string): string {
  return commit === "unknown" ? commit : commit.slice(0, 7);
}

const COMPACT_ABOVE = 24;

function ellipsize(value: string, head: number, tail: number): string {
  return value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** A long identifier shortened to its two ends; the full value stays available to the caller. */
export function compactId(value: string): string {
  return value.length <= COMPACT_ABOVE ? value : ellipsize(value, 8, 6);
}

/**
 * Compact forms for a set of identifiers shown together. If shortening would make two different
 * identifiers look identical, both ends grow until every compact form is distinct.
 */
export function compactIds(values: readonly string[]): Map<string, string> {
  const unique = [...new Set(values)];
  const longest = Math.max(0, ...unique.map((value) => value.length));

  for (let extra = 0; extra <= longest; extra += 2) {
    const compact = new Map(
      unique.map((value) => [
        value,
        value.length <= COMPACT_ABOVE
          ? value
          : ellipsize(value, 8 + extra, 6 + extra),
      ]),
    );
    if (new Set(compact.values()).size === unique.length) {
      return compact;
    }
  }
  return new Map(unique.map((value) => [value, value]));
}
