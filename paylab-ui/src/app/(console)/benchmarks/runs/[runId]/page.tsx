import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { PendingView } from "@/components/benchmarks/pending-view";

export const metadata: Metadata = { title: "Benchmark Run" };

const description =
  "Complete provenance, protocols, metrics, failure evidence, and Artifacts of one Benchmark Run.";

export default async function RunPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return (
    <BenchmarkFrame title="Benchmark Run" description={description}>
      <p className="mb-4 text-sm text-muted-foreground">
        Run <code className="font-mono text-foreground">{runId}</code>
      </p>
      <PendingView name="Benchmark Run detail" />
    </BenchmarkFrame>
  );
}
