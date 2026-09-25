import type { Metadata } from "next";
import { BenchmarkFrame } from "@/components/benchmarks/benchmark-frame";
import { ComparisonView } from "@/features/benchmarks/comparison/comparison-view";

export const metadata: Metadata = { title: "Benchmark Comparison" };

const description =
  "Compare two completed Benchmark Runs, scenario by scenario, with the conditions that make them comparable.";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || undefined;

export default async function ComparePage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;

  return (
    <BenchmarkFrame title="Benchmark Comparison" description={description}>
      <ComparisonView
        current={first(params.current)}
        reference={first(params.reference)}
      />
    </BenchmarkFrame>
  );
}
