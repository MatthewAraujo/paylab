import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/datetime";
import { withTrail } from "@/lib/pagination";
import type { WalletPage } from "./accounts-api";

/** The Merchant's Wallets. `basePath` decides where a row leads: the Account view or the Ledger view. */
export function WalletsList({
  page,
  basePath,
  trail,
}: Readonly<{
  page: WalletPage;
  basePath: "/accounts" | "/ledger";
  trail: string[];
}>) {
  if (page.items.length === 0) {
    return (
      <Card className="border-border/90 bg-card/75 shadow-none">
        <CardContent className="px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            No Wallets yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wallets created through the API will appear here, newest first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/90 bg-card/75 shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Wallets, newest first</caption>
          <thead className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Wallet
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Currency
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {page.items.map((wallet) => (
              <tr key={wallet.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`${basePath}/${wallet.id}`}
                    className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {wallet.id}
                  </Link>
                </td>
                <td className="px-4 py-3">{wallet.currency}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatTimestamp(wallet.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t px-4 py-3">
        <Pagination
          trail={trail}
          nextCursor={page.nextCursor}
          hrefFor={(next) => withTrail(basePath, next)}
        />
      </div>
    </Card>
  );
}
