import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { BenchmarkOverview } from "@/features/benchmarks/overview/benchmark-overview";

export const metadata: Metadata = { title: "Benchmarks" };

const description =
  "Performance evidence for the payment core, with the conditions that produced it.";

export default async function BenchmarksOverviewPage() {
  return (
    <BenchmarkFrame title="Benchmarks" description={description}>
      <BenchmarkOverview />
    </BenchmarkFrame>
  );
}
