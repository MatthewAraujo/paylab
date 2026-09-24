import type { Metadata } from "next";
import { WalletsView } from "@/features/accounts/wallets-view";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return WalletsView({
    title: "Accounts",
    description:
      "Browse Wallets and inspect how their Balances are derived from Ledger Entries.",
    basePath: "/accounts",
    searchParams,
  });
}
