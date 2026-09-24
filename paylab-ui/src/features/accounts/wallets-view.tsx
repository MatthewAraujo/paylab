import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { currentCursor, parseTrail, withTrail } from "@/lib/pagination";
import { loadWallets } from "./accounts-api";
import { WalletsList } from "./wallets-list";

type SearchParams = Record<string, string | string[] | undefined>;

/** The Merchant's Wallets as an entry point to either the Account view or the Ledger view. */
export async function WalletsView({
  title,
  description,
  basePath,
  searchParams,
}: Readonly<{
  title: "Accounts" | "Ledger";
  description: string;
  basePath: "/accounts" | "/ledger";
  searchParams: Promise<SearchParams>;
}>) {
  const capability = basePath === "/ledger" ? "ledger" : "accounts";

  if (!currentCapabilities.accounts || !currentCapabilities[capability]) {
    const notice = capabilityNotice(capability, title);
    return (
      <>
        <PageHeader title={title} description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const trail = parseTrail((await searchParams).pages);
  const result = await loadWallets(currentCursor(trail));

  return (
    <>
      <PageHeader title={title} description={description} />
      {result.ok ? (
        <WalletsList page={result.data} basePath={basePath} trail={trail} />
      ) : (
        <ApiErrorAlert title={result.title} message={result.message}>
          {/* A plain anchor forces a fresh server render, which is what a retry needs. */}
          <a
            href={withTrail(basePath, trail)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Retry
          </a>
        </ApiErrorAlert>
      )}
    </>
  );
}
