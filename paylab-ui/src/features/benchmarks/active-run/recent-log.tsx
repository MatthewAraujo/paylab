"use client";

import { useEffect, useRef } from "react";
import { useArtifact, useArtifactContent } from "../api/hooks";
import { logTailLines, logTailRange } from "./log-tail";

type RecentLogProps = {
  runId: string;
  /** The active scenario: its log Artifact is `<scenarioId>-log`. */
  scenarioId: string;
  /** The last successful progress refresh; a new value re-reads the log's size. */
  refreshedAt: number;
};

/**
 * The end of the active scenario's sanitized log, read through the Artifact's size and a bounded
 * offset. It is plain text (escaped by React) and deliberately not a live region: log lines are
 * never announced.
 */
export function RecentLog({
  runId,
  scenarioId,
  refreshedAt,
}: Readonly<RecentLogProps>) {
  const artifactId = `${scenarioId}-log`;
  const metadata = useArtifact(runId, artifactId);
  const { refetch } = metadata;

  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (seen.current !== null && seen.current !== refreshedAt) {
      void refetch();
    }
    seen.current = refreshedAt;
  }, [refreshedAt, refetch]);

  const size = metadata.data?.sizeBytes ?? 0;
  const range = logTailRange(size);
  const content = useArtifactContent(runId, artifactId, range, {
    enabled: size > 0,
  });

  // The offset moves as the log grows, so keep showing the last lines until the new ones arrive.
  const lastLines = useRef<string[]>([]);
  if (content.data) {
    lastLines.current = logTailLines(content.data);
  }
  const lines = lastLines.current;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Recent log output</p>
      {lines.length > 0 ? (
        <section aria-label="Recent log output">
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs">
            {lines.join("\n")}
          </pre>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          {metadata.isError || (metadata.data !== undefined && size === 0)
            ? "No log output yet."
            : "Reading the log…"}
        </p>
      )}
    </div>
  );
}
