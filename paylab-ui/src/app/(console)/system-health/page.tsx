import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { HealthPanel } from "@/features/health/health-panel";
import { getApiBaseUrl } from "@/lib/env";

export const metadata: Metadata = { title: "System Health" };

export default function SystemHealthPage() {
  return (
    <>
      <PageHeader
        title="System Health"
        description="Live application identity and reachability from the current PayLab API."
      />
      <HealthPanel apiBaseUrl={getApiBaseUrl()} />
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Only application status, name, and environment are exposed. Database,
        queue, worker, and provider health are not inferred.
      </p>
    </>
  );
}
