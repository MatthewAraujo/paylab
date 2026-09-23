import type { Metadata } from "next";
import { capabilityNotice } from "@/api/current-capabilities";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage() {
  const notice = capabilityNotice("ledger", "Ledger");

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Immutable debit and credit evidence for consummated financial events."
      />
      <CapabilityUnavailable
        title={notice.title}
        description={notice.description}
      />
    </>
  );
}
