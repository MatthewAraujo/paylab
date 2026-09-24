import type { Metadata } from "next";
import { WalletsView } from "@/features/accounts/wallets-view";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return WalletsView({
    title: "Ledger",
    description:
      "Immutable debit and credit evidence. Choose a Wallet to inspect its Ledger Entries.",
    basePath: "/ledger",
    searchParams,
  });
}
