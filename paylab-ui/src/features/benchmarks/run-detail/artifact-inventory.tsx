import { CircleCheck, CircleOff } from "lucide-react";
import type { ReactNode } from "react";
import { NOT_RECORDED } from "../rules";
import { formatBytes } from "./format-bytes";
import type { Artifact } from "./types";

const KIND_LABELS: Record<Artifact["kind"], string> = {
  LOG: "Log",
  QUERY_PLAN: "Query plan",
  RAW_DATA: "Raw data",
};

/**
 * One Artifact of a Run: what it is, which scenario it belongs to, how big it is and whether its
 * local file is on this machine. `action` is the slot the Artifact viewer plugs into; without
 * one the row is inventory only.
 */
export function ArtifactRow({
  artifact,
  action,
  showActionColumn = false,
}: Readonly<{
  artifact: Artifact;
  action?: ReactNode;
  showActionColumn?: boolean;
}>) {
  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        {KIND_LABELS[artifact.kind] ?? artifact.kind}
      </td>
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <span className="block">{artifact.label}</span>
        {artifact.legacyFile ? (
          <code className="break-all font-mono text-muted-foreground">
            {artifact.legacyFile}
          </code>
        ) : null}
      </th>
      <td className="px-3 py-2">
        {artifact.scenarioId ? (
          <code className="font-mono">{artifact.scenarioId}</code>
        ) : (
          <span className="text-muted-foreground">Whole Run</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {artifact.sizeBytes === undefined ? (
          <span className="font-sans text-muted-foreground">
            {NOT_RECORDED}
          </span>
        ) : (
          formatBytes(artifact.sizeBytes)
        )}
      </td>
      <td className="px-3 py-2">
        {artifact.available ? (
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            Available
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleOff aria-hidden="true" className="size-3.5" />
            Not available on this machine
          </span>
        )}
      </td>
      {showActionColumn ? <td className="px-3 py-2">{action}</td> : null}
    </tr>
  );
}

/**
 * The Artifacts of a Run with their availability. `renderAction` adds one action per row (the
 * viewer, wired by the Artifact task); it receives every Artifact, so the caller decides which
 * ones can be opened.
 */
export function ArtifactInventory({
  artifacts,
  renderAction,
}: Readonly<{
  artifacts: readonly Artifact[];
  renderAction?: (artifact: Artifact) => ReactNode;
}>) {
  if (artifacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This Run has no Artifacts.
      </p>
    );
  }

  return (
    <section
      aria-label="Artifacts of this Run, scrollable"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard reachable
      tabIndex={0}
      className="overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table
        aria-label="Artifacts of this Run"
        className="w-full min-w-[36rem] border-collapse text-xs"
      >
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2">
              Kind
            </th>
            <th scope="col" className="px-3 py-2">
              Label
            </th>
            <th scope="col" className="px-3 py-2">
              Scenario
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Size
            </th>
            <th scope="col" className="px-3 py-2">
              Availability
            </th>
            {renderAction ? (
              <th scope="col" className="px-3 py-2">
                Action
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {artifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              showActionColumn={Boolean(renderAction)}
              action={renderAction?.(artifact)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
