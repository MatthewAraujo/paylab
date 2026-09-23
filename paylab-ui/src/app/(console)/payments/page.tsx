import type { Metadata } from "next";
import { capabilityNotice } from "@/api/current-capabilities";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  const notice = capabilityNotice("payments", "Payments");

  return (
    <>
      <PageHeader
        title="Payments"
        description="Inspect lifecycle outcomes and trace each successful Payment to Ledger evidence."
        action={<Button disabled>Create Payment</Button>}
      />
      <CapabilityUnavailable
        title={notice.title}
        description={notice.description}
      />
    </>
  );
}
