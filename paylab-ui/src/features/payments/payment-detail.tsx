import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/datetime";
import { formatBrl } from "@/lib/money";
import { PaymentStatusBadge } from "./payment-status";
import type { Payment } from "./payments-api";
import { paymentsHref } from "./payments-filters";

const mono = "break-all font-mono text-sm";

function Field({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-base">{children}</dd>
    </div>
  );
}

function AccountLink({ id }: Readonly<{ id: string }>) {
  return (
    <Link
      href={paymentsHref({ accountId: id })}
      className={`${mono} text-primary underline-offset-4 hover:underline`}
    >
      {id}
    </Link>
  );
}

export function PaymentDetail({ payment }: Readonly<{ payment: Payment }>) {
  return (
    <>
      <Link
        href="/payments"
        className="mb-6 inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All Payments
      </Link>
      <Card className="border-border/90 bg-card/75 p-6 shadow-none">
        <dl className="grid gap-6 md:grid-cols-2">
          <Field label="Payment">
            <span className={mono}>{payment.id}</span>
          </Field>
          <Field label="Status">
            <PaymentStatusBadge status={payment.status} />
          </Field>
          <Field label="Amount">
            <span className="font-mono text-lg font-semibold">
              {formatBrl(payment.amount)}
            </span>
          </Field>
          <Field label="Currency">{payment.currency}</Field>
          <Field label="Source Account">
            <AccountLink id={payment.sourceAccountId} />
          </Field>
          <Field label="Destination Account">
            <AccountLink id={payment.destinationAccountId} />
          </Field>
          {payment.failureReason ? (
            <Field label="Failure reason">
              <span className="font-mono text-sm">{payment.failureReason}</span>
            </Field>
          ) : null}
          <Field label="Ledger Transaction">
            {payment.ledgerTransactionId ? (
              <span className={mono}>{payment.ledgerTransactionId}</span>
            ) : (
              <span className="text-muted-foreground">
                None: no ledger fact was written
              </span>
            )}
          </Field>
          <Field label="Created">{formatTimestamp(payment.createdAt)}</Field>
          <Field label="Updated">{formatTimestamp(payment.updatedAt)}</Field>
        </dl>
      </Card>
    </>
  );
}
