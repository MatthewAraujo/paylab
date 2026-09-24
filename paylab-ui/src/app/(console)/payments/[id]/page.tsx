import type { Metadata } from "next";
import Link from "next/link";
import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { PaymentDetail } from "@/features/payments/payment-detail";
import { loadPayment } from "@/features/payments/payments-api";

export const metadata: Metadata = { title: "Payment" };

const description =
  "A Payment is the intent and its lifecycle; the Ledger Transaction, when present, is the accounting fact.";

export default async function PaymentPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  if (!currentCapabilities.payments) {
    const notice = capabilityNotice("payments", "Payments");
    return (
      <>
        <PageHeader title="Payment" description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const { id } = await params;
  const result = await loadPayment(id);

  return (
    <>
      <PageHeader title="Payment" description={description} />
      {result.ok ? (
        <PaymentDetail payment={result.payment} />
      ) : (
        <ApiErrorAlert title={result.title} message={result.message}>
          {/* A plain anchor forces a fresh server render, which is what a retry needs. */}
          {result.notFound ? null : (
            <a
              href={`/payments/${encodeURIComponent(id)}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Retry
            </a>
          )}
          <Link
            href="/payments"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            All Payments
          </Link>
        </ApiErrorAlert>
      )}
    </>
  );
}
