import { AlertTriangle, Inbox, Info } from "lucide-react";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The API answered 404 without a Benchmark code: the capability is off, or not this environment. */
export function BenchmarkUnavailable() {
  return (
    <CapabilityUnavailable
      title="Benchmarks are not available"
      description="Benchmarks are a local development capability. Enable them on the API with BENCHMARK_ENABLED=true in a development environment, then reload."
    />
  );
}

/** A read failed because the API could not be reached or answered with a server error. */
export function BenchmarkUnreachable({
  onRetry,
}: Readonly<{ onRetry: () => void }>) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4" />
        Benchmark API unreachable
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The console could not read Benchmark data from the API. Check that the
        API is running and reachable from this browser.
      </p>
      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

/** A polite, busy placeholder while a read is in flight. */
export function BenchmarkLoading({
  label = "Loading",
}: Readonly<{ label?: string }>) {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  );
}

/** Nothing to show yet. Runs start from the terminal, so no action is offered here. */
export function BenchmarkEmpty({
  title = "No Benchmark Runs yet",
  description = "Start a Run from the terminal with pnpm benchmark:run in paylab-api. It will appear here as soon as it begins.",
}: Readonly<{ title?: string; description?: string }>) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Inbox
        aria-hidden="true"
        className="mx-auto mb-3 size-6 text-muted-foreground"
      />
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/** A background refresh failed; the last data stays on screen and this says how old it is. */
export function RefreshFailedNotice({
  lastUpdated,
}: Readonly<{ lastUpdated?: string }>) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      {lastUpdated
        ? `Refresh failed. Showing data from ${lastUpdated}.`
        : "Refresh failed. Showing the last data received."}
    </p>
  );
}

/** The Run list omitted stored records that could not be read; says so instead of hiding it. */
export function SkippedRecordsNotice({ count }: Readonly<{ count: number }>) {
  if (count <= 0) {
    return null;
  }

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <Info aria-hidden="true" className="size-4 shrink-0" />
      {count === 1
        ? "1 stored Run record was skipped because it could not be read."
        : `${count} stored Run records were skipped because they could not be read.`}
    </p>
  );
}
