import type { RunProgress } from "./benchmark-api";
import { BenchmarkRequestError } from "./results";

/** How often the progress of an active Run is re-read: bounded and human-scale, never a stream. */
export const PROGRESS_POLL_MS = 3000;

/**
 * Retry only what repeating can change: a transient failure (unreachable API, a 5xx) gets one
 * more attempt. A disabled capability, a missing Run, a refusal, a malformed answer, or a
 * programming error will not improve on retry, so it is shown at once.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!(error instanceof BenchmarkRequestError)) return false;
  const { failure } = error;
  return (
    failure.kind === "unreachable" ||
    (failure.kind === "http" && failure.status >= 500)
  );
}

/**
 * The `refetchInterval` of a Run's progress query: poll only while the Run is running and its
 * owner process is alive. Polling stops in every terminal state and for an abandoned record.
 */
export function progressRefetchInterval(
  progress: Pick<RunProgress, "status" | "abandoned"> | undefined,
  intervalMs: number = PROGRESS_POLL_MS,
): number | false {
  if (!progress) return false;
  return progress.status === "RUNNING" && !progress.abandoned
    ? intervalMs
    : false;
}
