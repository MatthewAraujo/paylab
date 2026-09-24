import type { components } from "@/api/generated/schema";

export type PaymentStatus = components["schemas"]["PaymentResponse"]["status"];

export const PAYMENT_STATUSES = [
  "CREATED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
] as const satisfies readonly PaymentStatus[];

export type PaymentFilters = {
  status?: (typeof PAYMENT_STATUSES)[number];
  accountId?: string;
  /** Inclusive, YYYY-MM-DD. */
  from?: string;
  /** Exclusive, YYYY-MM-DD. */
  to?: string;
  /** Opaque keyset position from the previous page's `nextCursor`. */
  cursor?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text || undefined;
}

/** Reads the URL's search parameters into filters; anything the API does not define is dropped. */
export function parsePaymentFilters(
  searchParams: SearchParams,
): PaymentFilters {
  const filters: PaymentFilters = {};
  const status = first(searchParams.status);

  if (PAYMENT_STATUSES.some((known) => known === status)) {
    filters.status = status as PaymentFilters["status"];
  }
  for (const key of ["accountId", "from", "to", "cursor"] as const) {
    const value = first(searchParams[key]);
    if (value) filters[key] = value;
  }

  return filters;
}

/** Paging (the cursor) is not filtering. */
export function hasActiveFilters(filters: PaymentFilters): boolean {
  return Boolean(
    filters.status || filters.accountId || filters.from || filters.to,
  );
}

/** The Payments URL for the given filters, optionally at a specific page. */
export function paymentsHref(filters: PaymentFilters, cursor?: string): string {
  const query = new URLSearchParams();

  for (const key of ["status", "accountId", "from", "to"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  if (cursor) query.set("cursor", cursor);

  const text = query.toString();
  return text ? `/payments?${text}` : "/payments";
}
