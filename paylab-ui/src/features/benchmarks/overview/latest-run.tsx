import Link from "next/link";
import { BenchmarkSection } from "@/components/benchmarks/benchmark-section";
import { CommitReference } from "@/components/benchmarks/commit-reference";
import { ProvenanceBadge } from "@/components/benchmarks/provenance-badge";
import { RunStatusBadge } from "@/components/benchmarks/run-status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  exactInstant,
  formatDuration,
  formatInstant,
  NOT_RECORDED,
  type RunListItem,
} from "@/features/benchmarks/rules";
import { cn } from "@/lib/utils";

const link = cn(buttonVariants({ variant: "outline", size: "sm" }));

function Fact({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

type LatestRunProps = {
  run: RunListItem;
  /** Where an imported Run's evidence came from (its full record). */
  importedSource?: string;
};

/** Identity, provenance and entries of the newest Run, whatever its status. */
export function LatestRun({ run, importedSource }: Readonly<LatestRunProps>) {
  return (
    <BenchmarkSection title="Latest Run">
      <div className="space-y-4 rounded-lg border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <ProvenanceBadge kind={run.kind} />
          <code className="font-mono text-sm">{run.runId}</code>
        </div>

        {run.status === "INCOMPLETE" && run.failure ? (
          <p
            role="note"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {run.failure.summary}
          </p>
        ) : null}

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Started">
            <time dateTime={run.startedAt} title={exactInstant(run.startedAt)}>
              {formatInstant(run.startedAt)}
            </time>
          </Fact>
          <Fact label="Duration">{formatDuration(run.durationMs)}</Fact>
          <Fact label="Commit">
            <CommitReference commit={run.source.commit} />
          </Fact>
          <Fact label="Branch">{run.source.branch}</Fact>
          {run.note ? <Fact label="Note">{run.note}</Fact> : null}
          <Fact label="Dataset">
            {run.dataset.description ?? run.dataset.fingerprint}
          </Fact>
          {run.kind === "imported" ? (
            <Fact label="Imported from">{importedSource ?? NOT_RECORDED}</Fact>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Link href={`/benchmarks/runs/${run.runId}`} className={link}>
            Open Run detail
          </Link>
          <Link href="/benchmarks/trends" className={link}>
            Historical trends
          </Link>
        </div>
      </div>
    </BenchmarkSection>
  );
}
