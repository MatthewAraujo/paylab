import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { PendingView } from "@/components/benchmarks/pending-view";

export const metadata: Metadata = { title: "Benchmark Comparison" };

const description =
  "Compare two completed Benchmark Runs, scenario by scenario, with the conditions that make them comparable.";

export default async function ComparePage() {
  return (
    <BenchmarkFrame title="Benchmark Comparison" description={description}>
      <PendingView name="Benchmark Comparison" />
    </BenchmarkFrame>
  );
}
