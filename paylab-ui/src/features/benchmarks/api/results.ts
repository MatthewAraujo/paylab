/**
 * Every way a benchmark read can end without data. Components receive one of these and never a
 * raw response, so each situation can get its own honest state:
 *
 * - `unavailable`: the API answered 404 with no error code, i.e. the benchmark capability is off
 *   (anything but local development). It is not a loading error and not a missing Run.
 * - `unreachable`: no answer at all (the API is down, wrong URL, network error).
 * - `malformed`: an answer that is not JSON or does not have the expected shape.
 * - `not-found`: an unknown Run or Artifact.
 * - `artifact-unavailable`: the Artifact is listed but its local file is not on this machine.
 * - `refused`: a 422 with the API's reason (invalid input, a Run that cannot be compared, a
 *   Run that cannot be the Baseline).
 * - `http`: any other HTTP error.
 */
export type BenchmarkFailure =
  | { kind: "unavailable" }
  | { kind: "unreachable"; message: string }
  | { kind: "malformed"; message: string }
  | { kind: "not-found"; code: string; message: string }
  | { kind: "artifact-unavailable"; message: string }
  | { kind: "refused"; code: string; message: string }
  | { kind: "http"; status: number; message: string };

export type BenchmarkResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: BenchmarkFailure };

/**
 * What a query throws when a read fails. Throwing (rather than returning a failure value) lets
 * TanStack Query keep the previous data visible when only a refresh fails.
 */
export class BenchmarkRequestError extends Error {
  constructor(readonly failure: BenchmarkFailure) {
    super(describeFailure(failure));
    this.name = "BenchmarkRequestError";
  }
}

export function describeFailure(failure: BenchmarkFailure): string {
  switch (failure.kind) {
    case "unavailable":
      return "Benchmarks are not available on this API.";
    case "http":
      return `The API answered with HTTP ${failure.status}: ${failure.message}`;
    default:
      return failure.message;
  }
}

export function unwrap<T>(result: BenchmarkResult<T>): T {
  if (result.ok) return result.data;
  throw new BenchmarkRequestError(result.failure);
}
