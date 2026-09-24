import type { Metadata } from "next";
import Link from "next/link";
import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { EntriesList } from "@/features/ledger/entries-list";
import { loadEntries } from "@/features/ledger/ledger-api";
import { currentCursor, parseTrail, withTrail } from "@/lib/pagination";

export const metadata: Metadata = { title: "Ledger" };

const description =
  "The Wallet's Ledger Entries, newest first. Its Balance is derived from exactly these entries.";
const linkClass = "text-sm text-primary underline-offset-4 hover:underline";

export default async function LedgerAccountPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!currentCapabilities.ledger) {
    const notice = capabilityNotice("ledger", "Ledger");
    return (
      <>
        <PageHeader title="Ledger" description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const { id } = await params;
  const trail = parseTrail((await searchParams).pages);
  const result = await loadEntries(id, currentCursor(trail));
  const here = `/ledger/${encodeURIComponent(id)}`;

  return (
    <>
      <PageHeader title="Ledger" description={description} />
      <nav aria-label="Related views" className="mb-6 flex gap-6">
        <Link href="/ledger" className={linkClass}>
          ← All Ledgers
        </Link>
        <Link href={`/accounts/${id}`} className={linkClass}>
          Wallet and Balance
        </Link>
      </nav>
      {result.ok ? (
        <EntriesList page={result.data} accountId={id} trail={trail} />
      ) : (
        <ApiErrorAlert title={result.title} message={result.message}>
          {result.notFound ? null : (
            <a href={withTrail(here, trail)} className={linkClass}>
              Retry
            </a>
          )}
        </ApiErrorAlert>
      )}
    </>
  );
}
