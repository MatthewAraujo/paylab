import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { NextPageLink } from "@/components/next-page-link";
import { ShortId } from "@/components/short-id";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/datetime";
import { formatBrl } from "@/lib/money";
import type { EntryPage } from "./ledger-api";

// Direction is text plus an icon, never color alone. The Amount stays unsigned: the ledger
// stores a positive Amount and a direction, and the UI must not imply a signed storage model.
const DIRECTION = {
  CREDIT: {
    label: "Credit",
    Icon: ArrowDownLeft,
    hint: "increases the Balance",
  },
  DEBIT: { label: "Debit", Icon: ArrowUpRight, hint: "decreases the Balance" },
} as const;

export function EntriesList({
  page,
  accountId,
}: Readonly<{ page: EntryPage; accountId: string }>) {
  if (page.items.length === 0) {
    return (
      <Card className="border-border/90 bg-card/75 shadow-none">
        <CardContent className="px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            No Ledger Entries yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Entries appear once a Payment settles or the Wallet is funded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/90 bg-card/75 shadow-none">
      <p className="border-b px-4 py-3 text-xs text-muted-foreground">
        Entries are immutable. A credit increases the Balance and a debit
        decreases it.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <caption className="sr-only">Ledger Entries, newest first</caption>
          <thead className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Created
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Entry
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Ledger Transaction
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Direction
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {page.items.map((entry) => {
              const { label, Icon, hint } = DIRECTION[entry.direction];
              return (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatTimestamp(entry.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    <ShortId id={entry.id} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    <ShortId id={entry.ledgerTransactionId} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="gap-1.5" title={hint}>
                      <Icon aria-hidden="true" className="size-3.5" />
                      {label}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {formatBrl(entry.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {page.nextCursor ? (
        <NextPageLink
          href={`/ledger/${accountId}?cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          Older Entries
        </NextPageLink>
      ) : null}
    </Card>
  );
}
