import type { Metadata } from "next";
import Link from "next/link";
import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { AccountDetail } from "@/features/accounts/account-detail";
import { loadAccount, loadBalance } from "@/features/accounts/accounts-api";

export const metadata: Metadata = { title: "Wallet" };

const description =
  "A Wallet holds a Merchant's funds. Its Balance is derived from Ledger Entries.";

export default async function AccountPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  if (!currentCapabilities.accounts) {
    const notice = capabilityNotice("accounts", "Accounts");
    return (
      <>
        <PageHeader title="Wallet" description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const { id } = await params;
  const [account, balance] = await Promise.all([
    loadAccount(id),
    loadBalance(id),
  ]);

  return (
    <>
      <PageHeader title="Wallet" description={description} />
      {account.ok ? (
        <AccountDetail account={account.data} balance={balance} />
      ) : (
        <ApiErrorAlert title={account.title} message={account.message}>
          {account.notFound ? null : (
            <a
              href={`/accounts/${encodeURIComponent(id)}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Retry
            </a>
          )}
          <Link
            href="/accounts"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            All Accounts
          </Link>
        </ApiErrorAlert>
      )}
    </>
  );
}
