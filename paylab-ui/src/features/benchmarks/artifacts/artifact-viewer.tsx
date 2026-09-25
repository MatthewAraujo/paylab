"use client";

import { AlertTriangle, Check, Copy, Download } from "lucide-react";
import { useId, useState } from "react";
import {
  BenchmarkLoading,
  BenchmarkUnavailable,
  BenchmarkUnreachable,
} from "@/components/benchmarks/states";
import { Button } from "@/components/ui/button";
import { artifactDownloadUrl } from "../api/benchmark-api";
import { BenchmarkRequestError } from "../api/results";
import { useArtifactText } from "./use-artifact-text";

type ArtifactViewerProps = {
  runId: string;
  artifactId: string;
  baseUrl?: string;
};

function Problem({ children }: Readonly<{ children: string }>) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/**
 * The body of the Artifact viewer: sanitized text in bounded chunks. Everything is rendered as
 * a text node (never HTML), so markup in a log shows up literally.
 */
export function ArtifactViewer({
  runId,
  artifactId,
  baseUrl,
}: Readonly<ArtifactViewerProps>) {
  const wrapId = useId();
  const [wrap, setWrap] = useState(false);
  const [message, setMessage] = useState("");
  const query = useArtifactText({ runId, artifactId, baseUrl });

  if (query.isPending) {
    return <BenchmarkLoading label="Loading log text" />;
  }

  if (!query.data) {
    const failure =
      query.error instanceof BenchmarkRequestError
        ? query.error.failure
        : undefined;
    switch (failure?.kind) {
      case "unavailable":
        return <BenchmarkUnavailable />;
      case "artifact-unavailable":
        return (
          <Problem>
            This file is listed for the Run but is not on this machine. It was
            produced elsewhere or has been removed.
          </Problem>
        );
      case "not-found":
        return <Problem>This Artifact was not found for this Run.</Problem>;
      default:
        return <BenchmarkUnreachable onRetry={() => query.refetch()} />;
    }
  }

  const chunks = query.data.pages;
  const text = chunks.map((chunk) => chunk.content).join("");
  const total = chunks[0].sizeBytes;
  const loaded = chunks.at(-1)?.nextOffset ?? total;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied loaded text");
    } catch {
      setMessage("Could not copy loaded text");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label htmlFor={wrapId} className="flex items-center gap-2">
          <input
            id={wrapId}
            type="checkbox"
            checked={wrap}
            onChange={(event) => setWrap(event.target.checked)}
          />
          Wrap lines
        </label>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {message.startsWith("Copied") ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          Copy loaded text
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={artifactDownloadUrl(runId, artifactId, baseUrl)} download>
            <Download aria-hidden="true" />
            Download complete file
          </a>
        </Button>
        <span role="status" className="sr-only">
          {message}
        </span>
      </div>

      <section
        aria-label="Log text"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable log must be reachable by keyboard
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-3"
      >
        <pre
          className={`font-mono text-xs ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
        >
          {text}
        </pre>
      </section>

      {query.isFetchNextPageError ? (
        <Problem>More text could not be loaded.</Problem>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {query.hasNextPage
            ? `Loaded ${loaded.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} bytes, more to load.`
            : `End of file (${total.toLocaleString("en-US")} bytes).`}
        </span>
        {query.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
