import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import { CopyableId } from "@/components/benchmarks/copyable-id";
import { ProvenanceBadge } from "@/components/benchmarks/provenance-badge";
import { RunStatusBadge } from "@/components/benchmarks/run-status-badge";
import {
  abbreviateCommit,
  exactInstant,
  formatDuration,
  formatInstant,
  NOT_RECORDED,
} from "../rules";
import type { RunDetail } from "./types";

function Field({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Instant({ iso }: Readonly<{ iso: string | undefined }>) {
  if (!iso) {
    return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
  }
  return (
    <time dateTime={iso} title={exactInstant(iso)}>
      {formatInstant(iso)}
    </time>
  );
}

const isUnknown = (value: string) => value === "unknown" || value === "";

/** A source field: the unknown marker of an Imported Run is said in words, never as a value. */
function Source({ value, label }: Readonly<{ value: string; label: string }>) {
  return isUnknown(value) ? (
    <span className="text-muted-foreground">{label} not recorded</span>
  ) : null;
}

export function RunIdentity({ run }: Readonly<{ run: RunDetail }>) {
  const environment = Object.entries(run.environment.details).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="identity-heading" className="space-y-3">
        <h2 id="identity-heading" className="text-base font-semibold">
          Identity and provenance
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <ProvenanceBadge kind={run.kind} />
          {run.abandoned ? (
            <span className="text-xs text-muted-foreground">
              The process that owned this Run is gone.
            </span>
          ) : null}
        </div>
        {run.kind === "imported" ? (
          <p className="flex items-start gap-2 rounded-md border bg-secondary/40 p-3 text-xs">
            <Archive aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This is an Imported record
              {run.imported ? (
                <>
                  {" "}
                  from <code className="font-mono">{run.imported.source}</code>
                </>
              ) : null}
              . It predates the benchmark executor, so its commit and branch
              were never captured and its measurements come from the recorded
              evidence.
            </span>
          </p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[10rem_1fr]">
          <Field label="Run id">
            <CopyableId label="Run id" value={run.runId} />
          </Field>
          <Field label="Note">
            {run.note ?? <span className="text-muted-foreground">No note</span>}
          </Field>
          <Field label="Commit">
            {isUnknown(run.source.commit) ? (
              <Source value={run.source.commit} label="Commit" />
            ) : (
              <code className="font-mono" title={run.source.commit}>
                {abbreviateCommit(run.source.commit)}
              </code>
            )}
          </Field>
          <Field label="Branch">
            {isUnknown(run.source.branch) ? (
              <Source value={run.source.branch} label="Branch" />
            ) : (
              <code className="font-mono">{run.source.branch}</code>
            )}
          </Field>
          <Field label="Started">
            <Instant iso={run.startedAt} />
          </Field>
          <Field label="Finished">
            {run.finishedAt || run.status !== "RUNNING" ? (
              <Instant iso={run.finishedAt} />
            ) : (
              "Still running"
            )}
          </Field>
          <Field label="Duration">{formatDuration(run.durationMs)}</Field>
          <Field label="Executor version">{run.executor.version}</Field>
          <Field label="Summary schema version">{run.schemaVersion}</Field>
        </dl>
      </section>

      <section aria-labelledby="environment-heading" className="space-y-3">
        <h2 id="environment-heading" className="text-base font-semibold">
          Environment
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[10rem_1fr]">
          <Field label="Fingerprint">
            <code className="break-all font-mono">
              {run.environment.fingerprint}
            </code>
          </Field>
          {environment.map(([name, value]) => (
            <Field key={name} label={name}>
              {value}
            </Field>
          ))}
        </dl>
      </section>

      <section aria-labelledby="dataset-heading" className="space-y-3">
        <h2 id="dataset-heading" className="text-base font-semibold">
          Dataset
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[10rem_1fr]">
          <Field label="Fingerprint">
            <CopyableId
              label="dataset fingerprint"
              value={run.dataset.fingerprint}
            />
          </Field>
          <Field label="Description">
            {run.dataset.description ?? (
              <span className="text-muted-foreground">{NOT_RECORDED}</span>
            )}
          </Field>
        </dl>
      </section>
    </div>
  );
}
