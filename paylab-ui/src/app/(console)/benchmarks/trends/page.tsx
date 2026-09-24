import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { PendingView } from "@/components/benchmarks/pending-view";

export const metadata: Metadata = { title: "Historical trends" };

const description =
  "One metric across the compatible completed Benchmark Runs, with the exact values beside it.";

export default async function TrendsPage() {
  return (
    <BenchmarkFrame title="Historical trends" description={description}>
      <PendingView name="Historical trends view" />
    </BenchmarkFrame>
  );
}
