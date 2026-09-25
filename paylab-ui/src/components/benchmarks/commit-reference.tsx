"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { abbreviateCommit, NOT_RECORDED } from "@/features/benchmarks/rules";

/**
 * A commit as its seven-character form, with reveal of the full hash and copy of it. An imported
 * Run has no commit ("unknown"): that is shown as not recorded, never as a hash.
 */
export function CommitReference({ commit }: Readonly<{ commit: string }>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  if (commit === "unknown") {
    return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
  }

  const short = abbreviateCommit(commit);
  const canReveal = short !== commit;

  async function copy() {
    try {
      await navigator.clipboard.writeText(commit);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <code className="break-all font-mono text-xs">
        {expanded ? commit : short}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Copy commit"
        onClick={copy}
      >
        {copied === "done" ? (
          <Check aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
      {canReveal ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${expanded ? "Hide" : "Show"} full commit`}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
        </Button>
      ) : null}
      <span role="status" className="sr-only">
        {copied === "done"
          ? "Copied commit"
          : copied === "failed"
            ? "Could not copy commit"
            : ""}
      </span>
    </span>
  );
}
