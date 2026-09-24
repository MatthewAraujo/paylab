import { Button } from "@/components/ui/button";
import type { DayRange } from "./report";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground";
const labelClass = "grid gap-1.5 text-xs font-semibold text-muted-foreground";

/** A plain GET form: the range lives in the URL, so it needs no client JavaScript. */
export function RangeForm({ range }: Readonly<{ range: DayRange }>) {
  return (
    <form
      method="get"
      action="/dashboard"
      className="mb-6 flex flex-wrap items-end gap-4"
    >
      <label className={labelClass}>
        From (UTC)
        <input
          type="date"
          name="from"
          defaultValue={range.from}
          required
          className={fieldClass}
        />
      </label>
      <label className={labelClass}>
        To (UTC)
        <input
          type="date"
          name="to"
          defaultValue={range.to}
          required
          className={fieldClass}
        />
      </label>
      <Button type="submit">Apply period</Button>
    </form>
  );
}
