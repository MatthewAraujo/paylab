import type { Metadata } from "next";
import { Suspense } from "react";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { BenchmarkLoading } from "@/components/benchmarks/states";
import { TrendsView } from "@/features/benchmarks/trends/trends-view";

export const metadata: Metadata = { title: "Historical trends" };

const description =
  "One metric across the compatible completed Benchmark Runs, with the exact values beside it.";

export default async function TrendsPage() {
  return (
    <BenchmarkFrame title="Historical trends" description={description}>
      <Suspense fallback={<BenchmarkLoading label="Loading trends" />}>
        <TrendsView />
      </Suspense>
    </BenchmarkFrame>
  );
}
