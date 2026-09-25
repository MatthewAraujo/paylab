"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useBaseline, useRuns } from "../api/hooks";
import { formatInstant } from "../rules";

const COMPARE = "/benchmarks/compare";

/** The address of a comparison; the address alone reproduces it. */
export function compareHref(current?: string, reference?: string): string {
  const parts = [
    current ? `current=${encodeURIComponent(current)}` : "",
    current && reference ? `reference=${encodeURIComponent(reference)}` : "",
  ].filter(Boolean);
  return parts.length ? `${COMPARE}?${parts.join("&")}` : COMPARE;
}

type Option = { runId: string; label: string; disabled: boolean };

function RunSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: Option[];
  onChange: (runId: string) => void;
}>) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
      >
        {value === "" ? <option value="">Choose a Run</option> : null}
        {options.map((option) => (
          <option
            key={option.runId}
            value={option.runId}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Choose the two Runs of a comparison. Only completed Runs can be chosen; the others are listed
 * as unavailable with their status. Every choice is a navigation, so the query string is the
 * single source of truth.
 */
export function RunSelectors({
  current,
  reference,
  baseUrl,
}: Readonly<{ current?: string; reference?: string; baseUrl?: string }>) {
  const router = useRouter();
  const runs = useRuns({ limit: 50 }, { baseUrl });
  const baseline = useBaseline({ baseUrl });
  const baselineId = baseline.data?.baseline?.runId;

  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
  const options: Option[] = items.map((item) => ({
    runId: item.runId,
    disabled: item.status !== "COMPLETED",
    label:
      item.status === "COMPLETED"
        ? `${item.runId} · ${formatInstant(item.startedAt)}`
        : `${item.runId} · unavailable (${item.status})`,
  }));
  for (const known of [current, reference]) {
    if (known && !options.some((option) => option.runId === known)) {
      options.push({ runId: known, label: known, disabled: false });
    }
  }

  const go = (nextCurrent?: string, nextReference?: string) =>
    router.push(compareHref(nextCurrent, nextReference));

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <RunSelect
          label="Current Run"
          value={current ?? ""}
          options={options}
          onChange={(runId) => go(runId, reference)}
        />
        <RunSelect
          label="Reference Run"
          value={reference ?? ""}
          options={options}
          onChange={(runId) => go(current, runId)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!current || !reference}
          onClick={() => go(reference, current)}
        >
          Swap
        </Button>
      </div>
      {baselineId && baselineId !== reference && baselineId !== current ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!current}
          onClick={() => go(current, baselineId)}
        >
          Use the Baseline as reference
        </Button>
      ) : null}
    </div>
  );
}
