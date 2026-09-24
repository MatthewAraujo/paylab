import type { components } from "@/api/generated/schema";
import {
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "@/features/payments/payments-filters";

export type DailyReportData = components["schemas"]["DailyReportResponse"];
export type ReportRow = components["schemas"]["DailyReportRowResponse"];
export type DayRange = { from: string; to: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The last 7 UTC days ending today, both ends inclusive (the report's own convention). */
export function defaultRange(now: Date): DayRange {
  return {
    from: isoDay(new Date(now.getTime() - (DEFAULT_DAYS - 1) * DAY_MS)),
    to: isoDay(now),
  };
}

function isRealDay(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isoDay(new Date(`${value}T00:00:00.000Z`)) === value
  );
}

/** The range from the URL, or the default when either day is missing or not a real calendar day. */
export function parseRange(
  searchParams: Record<string, string | string[] | undefined>,
  now: Date,
): DayRange {
  const [from, to] = (["from", "to"] as const).map((key) =>
    [searchParams[key]].flat()[0]?.trim(),
  );
  return isRealDay(from) && isRealDay(to) ? { from, to } : defaultRange(now);
}

/** Totals over the rows the report returned; the report is not paginated, so these are exact. */
export function summarize(items: ReportRow[]) {
  const byStatus = Object.fromEntries(
    PAYMENT_STATUSES.map((status) => [status, { count: 0, volume: 0 }]),
  ) as Record<PaymentStatus, { count: number; volume: number }>;

  for (const item of items) {
    byStatus[item.status].count += item.count;
    byStatus[item.status].volume += item.volume;
  }

  return {
    total: items.reduce((sum, item) => sum + item.count, 0),
    byStatus,
  };
}
