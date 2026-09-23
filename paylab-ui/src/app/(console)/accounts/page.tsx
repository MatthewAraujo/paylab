import type { Metadata } from "next";
import { capabilityNotice } from "@/api/current-capabilities";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  const notice = capabilityNotice("accounts", "Accounts");

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Find Wallets and inspect how their Balances are derived from Ledger Entries."
        action={<Button disabled>Create Wallet</Button>}
      />
      <CapabilityUnavailable
        title={notice.title}
        description={notice.description}
      />
    </>
  );
}
