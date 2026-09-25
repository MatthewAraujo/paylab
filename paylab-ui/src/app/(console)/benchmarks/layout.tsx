import type { ReactNode } from "react";
import { BenchmarksSubNav } from "@/components/benchmarks/benchmarks-sub-nav";

export default function BenchmarksLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <BenchmarksSubNav />
      {children}
    </>
  );
}
