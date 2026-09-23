import type { Metadata } from "next";
import { capabilityNotice } from "@/api/current-capabilities";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

const metrics = [
  ["Reporting", "Unavailable", "OpenAPI response schema pending"],
  ["Payment volume", "—", "No typed report contract"],
  ["Payment count", "—", "No typed report contract"],
] as const;

export default function DashboardPage() {
  const notice = capabilityNotice("dashboard", "Reporting");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Financial activity at a glance when the reporting contract becomes available."
      />
      <div className="mb-6 grid overflow-hidden rounded-xl border bg-border md:grid-cols-3 md:gap-px">
        {metrics.map(([label, value, detail]) => (
          <Card
            key={label}
            className="rounded-none border-0 bg-card shadow-none"
          >
            <CardContent className="min-h-28 px-6 py-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-3 text-lg font-semibold tracking-tight text-muted-foreground">
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <CapabilityUnavailable
        title={notice.title}
        description={notice.description}
      />
    </>
  );
}
