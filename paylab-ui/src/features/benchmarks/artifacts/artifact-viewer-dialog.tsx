"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArtifactViewer } from "./artifact-viewer";

export type ArtifactViewerDialogProps = {
  runId: string;
  artifactId: string;
  /** Human label of the Artifact, shown as the dialog title. */
  label: string;
  /** Trigger content. Defaults to the label. */
  children?: ReactNode;
  /** Defaults to the configured API URL. */
  baseUrl?: string;
};

/**
 * A trigger button plus a dialog that reads one sanitized Artifact as plain text. Self-contained:
 * nothing is requested until it is opened, and it needs only a `QueryClientProvider` above it.
 */
export function ArtifactViewerDialog({
  runId,
  artifactId,
  label,
  children,
  baseUrl,
}: Readonly<ArtifactViewerDialogProps>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-auto p-0">
          {children ?? label}
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[80vh]">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Sanitized plain text. Artifacts are retained locally on the machine
            that ran the benchmark and are never committed to the repository.
          </DialogDescription>
        </DialogHeader>
        <ArtifactViewer
          runId={runId}
          artifactId={artifactId}
          baseUrl={baseUrl}
        />
      </DialogContent>
    </Dialog>
  );
}
