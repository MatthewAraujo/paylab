import type { Metadata } from "next";
import {
  capabilityNotice,
  currentCapabilities,
} from "@/api/current-capabilities";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { DailyReport } from "@/features/dashboard/daily-report";
import { RangeForm } from "@/features/dashboard/range-form";
import { parseRange } from "@/features/dashboard/report";
import { loadDailyReport } from "@/features/dashboard/report-api";

export const metadata: Metadata = { title: "Dashboard" };

const description =
  "Payment activity per UTC day and status, straight from the daily report.";

export default async function DashboardPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!currentCapabilities.dashboard) {
    const notice = capabilityNotice("dashboard", "Reporting");
    return (
      <>
        <PageHeader title="Dashboard" description={description} />
        <CapabilityUnavailable
          title={notice.title}
          description={notice.description}
        />
      </>
    );
  }

  const range = parseRange(await searchParams, new Date());
  const result = await loadDailyReport(range);

  return (
    <>
      <PageHeader title="Dashboard" description={description} />
      <RangeForm range={range} />
      {result.ok ? (
        <DailyReport report={result.data} />
      ) : (
        <ApiErrorAlert title={result.title} message={result.message}>
          {/* A plain anchor forces a fresh server render, which is what a retry needs. */}
          <a
            href={`/dashboard?from=${range.from}&to=${range.to}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Retry
          </a>
        </ApiErrorAlert>
      )}
    </>
  );
}
