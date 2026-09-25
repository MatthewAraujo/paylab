import { TriangleAlert } from "lucide-react";
import { formatInstant, NOT_RECORDED, type Scenario } from "../rules";
import { ScenarioGroups } from "./scenario-groups";
import type { Failure } from "./types";

/**
 * Why an Incomplete Run stopped: the scenario, its command, the exit status or an interruption,
 * its times, and the summary the executor wrote. Always the first thing shown for such a Run.
 */
export function FailureEvidence({
  failure,
  scenarios,
}: Readonly<{ failure: Failure; scenarios: readonly Scenario[] }>) {
  const failed = scenarios.find(({ id }) => id === failure.scenarioId);

  return (
    <section
      aria-labelledby="failure-evidence-heading"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <h2
        id="failure-evidence-heading"
        className="flex items-center gap-2 text-base font-semibold"
      >
        <TriangleAlert aria-hidden="true" className="size-4" />
        Failure evidence
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Scenario</dt>
        <dd>
          {failure.scenarioId ? (
            <code className="font-mono">{failure.scenarioId}</code>
          ) : (
            "Before the first scenario"
          )}
        </dd>
        <dt className="text-muted-foreground">Command</dt>
        <dd>
          {failure.command ? (
            <code className="break-all font-mono">{failure.command}</code>
          ) : (
            NOT_RECORDED
          )}
        </dd>
        <dt className="text-muted-foreground">Exit status</dt>
        <dd>
          {failure.exitStatus === undefined
            ? "No exit status recorded (interrupted, or the scenario could not start)"
            : failure.exitStatus}
        </dd>
        <dt className="text-muted-foreground">Started</dt>
        <dd>
          {failed?.startedAt ? formatInstant(failed.startedAt) : NOT_RECORDED}
        </dd>
        <dt className="text-muted-foreground">Stopped</dt>
        <dd>
          {failed?.finishedAt ? formatInstant(failed.finishedAt) : NOT_RECORDED}
        </dd>
        <dt className="text-muted-foreground">Summary</dt>
        <dd>{failure.summary}</dd>
      </dl>
    </section>
  );
}

/**
 * What the Run measured before it failed. Deliberately separate from the failure and from any
 * comparison: these numbers are diagnostic only.
 */
export function DiagnosticMeasurements({
  scenarios,
}: Readonly<{ scenarios: readonly Scenario[] }>) {
  const completed = scenarios.filter(
    ({ status, metrics }) => status === "COMPLETED" && metrics.length > 0,
  );

  return (
    <section
      aria-labelledby="diagnostic-heading"
      className="space-y-3 rounded-lg border border-dashed p-4"
    >
      <h2 id="diagnostic-heading" className="text-base font-semibold">
        Diagnostic measurements completed before failure
      </h2>
      <p className="text-xs text-muted-foreground">
        These scenarios finished before the Run stopped. A partial Run cannot be
        compared or become the Baseline.
      </p>
      {completed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No scenario completed before the failure.
        </p>
      ) : (
        <ScenarioGroups scenarios={completed} />
      )}
    </section>
  );
}
