import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ShortId } from "@/components/short-id";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/datetime";
import { formatBrl } from "@/lib/money";
import { PaymentStatusBadge } from "./payment-status";
import type { PaymentPage } from "./payments-api";
import {
  hasActiveFilters,
  type PaymentFilters,
  paymentsHref,
} from "./payments-filters";

const idClass = "whitespace-nowrap font-mono text-xs";

/** An Account id that narrows the list to that Account's Payments. */
function AccountLink({
  id,
  filters,
}: Readonly<{ id: string; filters: PaymentFilters }>) {
  return (
    <Link
      href={paymentsHref({ ...filters, accountId: id })}
      className="text-primary underline-offset-4 hover:underline"
    >
      <ShortId id={id} />
    </Link>
  );
}

export function PaymentsList({
  page,
  filters,
}: Readonly<{ page: PaymentPage; filters: PaymentFilters }>) {
  const filtered = hasActiveFilters(filters);

  if (page.items.length === 0) {
    return (
      <Card className="border-border/90 bg-card/75 shadow-none">
        <CardContent className="px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {filtered ? "No Payments match these filters" : "No Payments yet"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered
              ? "Try a wider period or remove a filter."
              : "Payments created through the API will appear here, newest first."}
          </p>
          {filtered ? (
            <Link
              href="/payments"
              className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/90 bg-card/75 shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <caption className="sr-only">Payments, newest first</caption>
          <thead className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Created
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Payment
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Source
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Destination
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Amount
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Failure reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {page.items.map((payment) => (
              <tr key={payment.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatTimestamp(payment.createdAt)}
                </td>
                <td className={`px-4 py-3 ${idClass}`}>
                  <Link
                    href={`/payments/${payment.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    <ShortId id={payment.id} />
                  </Link>
                </td>
                <td className={`px-4 py-3 ${idClass}`}>
                  <AccountLink id={payment.sourceAccountId} filters={filters} />
                </td>
                <td className={`px-4 py-3 ${idClass}`}>
                  <AccountLink
                    id={payment.destinationAccountId}
                    filters={filters}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  {formatBrl(payment.amount)}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={payment.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {payment.failureReason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page.nextCursor ? (
        <div className="flex justify-end border-t px-4 py-3">
          <Link
            href={paymentsHref(filters, page.nextCursor)}
            className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            Older Payments <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
