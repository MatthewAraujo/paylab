"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BaselineSelection, RunStatus } from "../api/benchmark-api";
import { useBaseline, useSelectBaseline } from "../api/hooks";
import { BenchmarkRequestError } from "../api/results";
import { BaselineGitNotice } from "./baseline-git-notice";

export type BaselineActionProps = {
  runId: string;
  status: RunStatus;
  /** Trigger text; defaults to the wording for the Run being viewed. */
  label?: string;
  /** False when the API contract has no Baseline write; the action explains instead. */
  enabled?: boolean;
  baseUrl?: string;
};

function CurrentBaseline({ baseUrl }: Readonly<{ baseUrl?: string }>) {
  const baseline = useBaseline({ baseUrl });
  const runId = baseline.data?.baseline?.runId;
  if (baseline.isPending) {
    return <span className="text-muted-foreground">Reading the Baseline…</span>;
  }
  if (baseline.isError) {
    return (
      <span className="text-muted-foreground">
        The Baseline could not be read
      </span>
    );
  }
  return runId ? (
    <code className="break-all font-mono">{runId}</code>
  ) : (
    <span>No Baseline selected</span>
  );
}

function Outcome({ result }: Readonly<{ result: BaselineSelection }>) {
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm">
        {result.changed ? (
          <>
            The Baseline is now{" "}
            <code className="break-all font-mono">
              {result.baseline?.runId}
            </code>
            .
          </>
        ) : (
          <>
            No change: this Run already was the Baseline. Nothing was written.
          </>
        )}
      </p>
      <BaselineGitNotice git={result.git} />
    </div>
  );
}

function Failure({
  error,
  baselineId,
}: Readonly<{ error: unknown; baselineId: string | undefined }>) {
  const failure = error instanceof BenchmarkRequestError ? error.failure : null;
  const reason =
    failure?.kind === "unavailable"
      ? "Baseline selection is not available on this API."
      : failure?.kind === "unreachable"
        ? `The API is not reachable: ${failure.message}`
        : (failure?.kind === "refused" ||
              failure?.kind === "not-found" ||
              failure?.kind === "http") &&
            "message" in failure
          ? failure.message
          : String(error);
  return (
    <div
      role="alert"
      className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <p>{reason}</p>
      <p className="text-muted-foreground">
        {baselineId
          ? `The Baseline is still ${baselineId}.`
          : "No Baseline is selected."}
      </p>
    </div>
  );
}

/**
 * Select a completed Run as the Benchmark Baseline, after a confirmation that names the current
 * and the proposed Baseline and says what changes in Git. The dialog stays open on the outcome
 * (success, no change, or the reason it failed) so the previous Baseline is never left unclear.
 */
export function BaselineAction({
  runId,
  status,
  label = "Make this Run the Baseline",
  enabled = true,
  baseUrl,
}: Readonly<BaselineActionProps>) {
  const [open, setOpen] = useState(false);
  const baseline = useBaseline({ baseUrl });
  const select = useSelectBaseline({ baseUrl });

  if (!enabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Baseline selection is not available on this API.
      </p>
    );
  }
  if (status !== "COMPLETED") {
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" disabled>
          {label}
        </Button>
        <p className="text-xs text-muted-foreground">
          Only a completed Run can become the Baseline.
        </p>
      </div>
    );
  }

  const baselineId = baseline.data?.baseline?.runId;
  const isBaseline = baselineId === runId;

  const onOpenChange = (next: boolean) => {
    if (select.isPending) return;
    if (next) select.reset();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {isBaseline ? null : (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            {label}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make this Run the Baseline?</DialogTitle>
          <DialogDescription>
            Every comparison against the Baseline, and the trends, will use this
            Run as the reference.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Current Baseline</dt>
            <dd>
              <CurrentBaseline baseUrl={baseUrl} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Proposed Baseline</dt>
            <dd>
              <code className="break-all font-mono">{runId}</code>
            </dd>
          </div>
        </dl>
        {select.data ? (
          <Outcome result={select.data} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              This rewrites the Baseline pointer file on the machine running the
              API. It shows up as a reviewable Git change; nothing is committed
              or pushed for you.
            </p>
            {select.isError ? (
              <Failure error={select.error} baselineId={baselineId} />
            ) : null}
          </>
        )}
        <DialogFooter>
          {select.data ? (
            <DialogClose asChild>
              <Button type="button">Close</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={select.isPending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={select.isPending}
                onClick={() => select.mutate(runId)}
              >
                {select.isPending ? "Selecting…" : "Make Baseline"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
