import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { RunDetailView } from "@/features/benchmarks/run-detail/run-detail-view";

export const metadata: Metadata = { title: "Benchmark Run" };

const description =
  "Every persisted state and normalized measurement of one Benchmark Run: provenance, scenarios, failure evidence, and Artifacts.";

export default async function RunPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return (
    <BenchmarkFrame title="Benchmark Run" description={description}>
      <RunDetailView runId={runId} />
    </BenchmarkFrame>
  );
}
