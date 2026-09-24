import Link from "next/link";
import type { ReactNode } from "react";
import type { ReadResult } from "@/api/read";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Card } from "@/components/ui/card";
import { formatBrl } from "@/lib/money";
import type { Account, Balance } from "./accounts-api";

const linkClass = "text-sm text-primary underline-offset-4 hover:underline";

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

export function AccountDetail({
  account,
  balance,
}: Readonly<{ account: Account; balance: ReadResult<Balance> }>) {
  return (
    <>
      <Link href="/accounts" className={`${linkClass} mb-6 inline-block`}>
        ← All Accounts
      </Link>
      <Card className="border-border/90 bg-card/75 p-6 shadow-none">
        <dl className="grid gap-6 md:grid-cols-2">
          <Field label="Wallet">
            <span className="break-all font-mono text-sm">{account.id}</span>
          </Field>
          <Field label="Currency">{account.currency}</Field>
          <Field label="Balance">
            {balance.ok ? (
              <>
                <span className="font-mono text-lg font-semibold">
                  {formatBrl(balance.data.balance)}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Derived from Ledger Entries: credits minus debits. It is never
                  stored or edited.
                </p>
              </>
            ) : (
              <ApiErrorAlert title={balance.title} message={balance.message} />
            )}
          </Field>
        </dl>
        <nav
          aria-label="Related views"
          className="mt-8 flex gap-6 border-t pt-5"
        >
          <Link href={`/ledger/${account.id}`} className={linkClass}>
            View Ledger Entries
          </Link>
          <Link
            href={`/payments?accountId=${account.id}`}
            className={linkClass}
          >
            View Payments
          </Link>
        </nav>
      </Card>
    </>
  );
}
