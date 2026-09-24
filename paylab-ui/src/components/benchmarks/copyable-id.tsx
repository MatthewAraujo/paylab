"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const WHOLE_UP_TO = 32;
const HEAD = 12;
const TAIL = 8;

/**
 * Long opaque values (commits, hashes) are shortened to their start and end; anything up to
 * the length of a Run id stays whole so two Runs never look alike.
 */
export function compactId(value: string): string {
  if (value.length <= WHOLE_UP_TO) {
    return value;
  }

  return `${value.slice(0, HEAD)}…${value.slice(-TAIL)}`;
}

type CopyableIdProps = {
  /** Names the value for assistive technology, for example "commit" or "Run id". */
  label: string;
  value: string;
};

/** An identifier in monospace with copy-full-value and reveal/hide controls. */
export function CopyableId({ label, value }: Readonly<CopyableIdProps>) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const compact = compactId(value);
  const isCompacted = compact !== value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${label}`);
    } catch {
      setMessage(`Could not copy ${label}`);
    }
  }

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {isCompacted && !expanded ? (
        <>
          <code className="font-mono text-xs" title={value} aria-hidden="true">
            {compact}
          </code>
          <span className="sr-only">{value}</span>
        </>
      ) : (
        <code className="break-all font-mono text-xs">{value}</code>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={`Copy ${label}`}
        onClick={copy}
      >
        {message.startsWith("Copied") ? (
          <Check aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
      {isCompacted ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${expanded ? "Hide" : "Show"} full ${label}`}
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
        {message}
      </span>
    </span>
  );
}
