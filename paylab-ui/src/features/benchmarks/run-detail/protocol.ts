import { formatDuration } from "../rules";
import type { Protocol } from "./types";

/**
 * The measurement protocol of a scenario in one line: warm-up, duration, repetitions and how the
 * repetitions were aggregated. Parts the source did not record are left out, not guessed.
 */
export function formatProtocol(protocol: Protocol): string {
  const parts: string[] = [];
  if (protocol.warmupRuns !== undefined) {
    parts.push(
      `${protocol.warmupRuns} warm-up ${protocol.warmupRuns === 1 ? "run" : "runs"}`,
    );
  }
  if (protocol.warmupMs !== undefined) {
    parts.push(`Warm-up ${formatDuration(protocol.warmupMs)}`);
  }
  if (protocol.durationMs !== undefined) {
    parts.push(`Duration ${formatDuration(protocol.durationMs)}`);
  }
  parts.push(
    `${protocol.repetitions} ${protocol.repetitions === 1 ? "repetition" : "repetitions"}`,
  );
  parts.push(protocol.aggregation);
  return parts.join(" · ");
}
