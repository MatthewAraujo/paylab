import { AlertTriangle, SearchX } from "lucide-react";
import Link from "next/link";
import type { BenchmarkFailure } from "@/features/benchmarks/api/results";
import { BenchmarkUnavailable, BenchmarkUnreachable } from "./states";

type BenchmarkFailureStateProps = {
  failure: BenchmarkFailure;
  onRetry: () => void;
  /** What was being read, for the not-found state ("Benchmark Run"). */
  subject?: string;
  /** The identifier that was asked for, shown in full. */
  subjectId?: string;
};

/**
 * One honest state per way a benchmark read can end without data. Capability off, unreachable
 * API, an unknown record and a malformed record are different situations and read differently.
 */
export function BenchmarkFailureState({
  failure,
  onRetry,
  subject = "Benchmark Run",
  subjectId,
}: Readonly<BenchmarkFailureStateProps>) {
  switch (failure.kind) {
    case "unavailable":
      return <BenchmarkUnavailable />;
    case "unreachable":
    case "http":
      return <BenchmarkUnreachable onRetry={onRetry} />;
    case "not-found":
      return (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <SearchX
            aria-hidden="true"
            className="mx-auto mb-3 size-6 text-muted-foreground"
          />
          <h2 className="font-semibold">{subject} not found</h2>
          {subjectId ? (
            <p className="mt-2 text-sm">
              <code className="break-all font-mono">{subjectId}</code>
            </p>
          ) : null}
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            {failure.message}
          </p>
          <p className="mt-4 text-sm">
            <Link href="/benchmarks" className="underline underline-offset-4">
              Back to the Benchmarks overview
            </Link>
          </p>
        </div>
      );
    case "malformed":
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            Benchmark record could not be read
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The API answered, but the record is not in the expected shape, so
            nothing is shown rather than guessing. {failure.message}
          </p>
        </div>
      );
    default:
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            The request was refused
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {failure.message}
          </p>
        </div>
      );
  }
}
