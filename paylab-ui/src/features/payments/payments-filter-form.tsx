import { Button } from "@/components/ui/button";
import { PAYMENT_STATUSES, type PaymentFilters } from "./payments-filters";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground";
const labelClass = "grid gap-1.5 text-xs font-semibold text-muted-foreground";

/** A plain GET form: filters live in the URL, so it needs no client JavaScript. Submitting drops the cursor. */
export function PaymentsFilterForm({
  filters,
}: Readonly<{ filters: PaymentFilters }>) {
  return (
    <form
      method="get"
      action="/payments"
      className="mb-6 flex flex-wrap items-end gap-4"
    >
      <label className={labelClass}>
        Status
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={fieldClass}
        >
          <option value="">All</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Account id
        <input
          name="accountId"
          defaultValue={filters.accountId ?? ""}
          placeholder="Source or destination"
          className={`${fieldClass} w-80 font-mono`}
        />
      </label>
      <label className={labelClass}>
        From (inclusive, UTC)
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className={fieldClass}
        />
      </label>
      <label className={labelClass}>
        To (exclusive, UTC)
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className={fieldClass}
        />
      </label>
      <Button type="submit">Apply filters</Button>
    </form>
  );
}
