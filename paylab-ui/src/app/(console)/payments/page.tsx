import { RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { loadPayments } from "@/features/payments/payments-api";
import { PaymentsFilterForm } from "@/features/payments/payments-filter-form";
import {
  parsePaymentFilters,
  paymentsHref,
} from "@/features/payments/payments-filters";
import { PaymentsList } from "@/features/payments/payments-list";

export const metadata: Metadata = { title: "Payments" };

const description =
  "Inspect lifecycle outcomes and trace each successful Payment to Ledger evidence.";

export default async function PaymentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!currentCapabilities.payments) {
    const notice = capabilityNotice("payments", "Payments");
    return (
      <>
        <PageHeader title="Payments" description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const filters = parsePaymentFilters(await searchParams);
  const result = await loadPayments(filters);

  return (
    <>
      <PageHeader title="Payments" description={description} />
      <PaymentsFilterForm filters={filters} />
      {result.ok ? (
        <PaymentsList page={result.page} filters={filters} />
      ) : (
        <ApiErrorAlert title={result.title} message={result.message}>
          {/* A plain anchor forces a fresh server render, which is what a retry needs. */}
          <a
            href={paymentsHref(filters, filters.cursor)}
            className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            <RefreshCw aria-hidden="true" className="size-4" /> Retry
          </a>
        </ApiErrorAlert>
      )}
    </>
  );
}
