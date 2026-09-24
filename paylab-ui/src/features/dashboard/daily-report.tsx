import { Card, CardContent } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/features/payments/payment-status";
import { formatBrl } from "@/lib/money";
import { type DailyReportData, summarize } from "./report";

function Metric({
  label,
  value,
  detail,
}: Readonly<{ label: string; value: string; detail: string }>) {
  return (
    <Card className="rounded-none border-0 bg-card shadow-none">
      <CardContent className="min-h-28 px-6 py-5">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground/80">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function DailyReport({ report }: Readonly<{ report: DailyReportData }>) {
  if (report.items.length === 0) {
    return (
      <Card className="border-border/90 bg-card/75 shadow-none">
        <CardContent className="px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            No Payments in this period
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.from} to {report.to} (UTC, inclusive) has no Payments.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { total, byStatus } = summarize(report.items);

  return (
    <>
      <div className="mb-6 grid overflow-hidden rounded-xl border bg-border md:grid-cols-3 md:gap-px">
        <Metric
          label="Payments"
          value={String(total)}
          detail={`${report.from} to ${report.to} (UTC)`}
        />
        <Metric
          label="Succeeded volume"
          value={formatBrl(byStatus.SUCCEEDED.volume)}
          detail={`${byStatus.SUCCEEDED.count} settled Payments`}
        />
        <Metric
          label="Failed Payments"
          value={String(byStatus.FAILED.count)}
          detail={`${formatBrl(byStatus.FAILED.volume)} requested, not moved`}
        />
      </div>
      <Card className="overflow-hidden border-border/90 bg-card/75 shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">
              Payments per UTC day and status
            </caption>
            <thead className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Day (UTC)
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Count
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Volume
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((row) => (
                <tr key={`${row.date}-${row.status}`}>
                  <td className="whitespace-nowrap px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.count}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {formatBrl(row.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Volume is the sum of the Payments' Amounts with that status. Only
          succeeded Payments moved money.
        </p>
      </Card>
    </>
  );
}
