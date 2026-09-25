import { describe, expect, it } from "vitest";
import { runProgress } from "@/test/benchmark-fixtures";
import {
  PROGRESS_POLL_MS,
  progressRefetchInterval,
  shouldRetry,
} from "./policy";
import { type BenchmarkFailure, BenchmarkRequestError } from "./results";

const error = (failure: BenchmarkFailure) => new BenchmarkRequestError(failure);

describe("shouldRetry", () => {
  it("retries a transient failure once, and then gives up", () => {
    const unreachable = error({ kind: "unreachable", message: "down" });
    const server = error({ kind: "http", status: 503, message: "busy" });

    expect(shouldRetry(0, unreachable)).toBe(true);
    expect(shouldRetry(1, unreachable)).toBe(false);
    expect(shouldRetry(0, server)).toBe(true);
    expect(shouldRetry(1, server)).toBe(false);
  });

  it("never retries an answer that repeating cannot change", () => {
    const answers: BenchmarkFailure[] = [
      { kind: "unavailable" },
      { kind: "not-found", code: "BENCHMARK_RUN_NOT_FOUND", message: "x" },
      { kind: "artifact-unavailable", message: "gone" },
      { kind: "refused", code: "VALIDATION_ERROR", message: "bad" },
      { kind: "malformed", message: "not JSON" },
      { kind: "http", status: 400, message: "bad request" },
    ];

    for (const failure of answers) {
      expect(shouldRetry(0, error(failure)), failure.kind).toBe(false);
    }
  });

  it("does not retry a programming error", () => {
    expect(shouldRetry(0, new TypeError("undefined is not a function"))).toBe(
      false,
    );
  });
});

describe("progressRefetchInterval", () => {
  it("polls a Run that is running and whose owner is alive", () => {
    expect(progressRefetchInterval(runProgress())).toBe(PROGRESS_POLL_MS);
  });

  it("accepts another interval", () => {
    expect(progressRefetchInterval(runProgress(), 500)).toBe(500);
  });

  it("stops in every terminal state", () => {
    expect(progressRefetchInterval(runProgress({ status: "COMPLETED" }))).toBe(
      false,
    );
    expect(progressRefetchInterval(runProgress({ status: "INCOMPLETE" }))).toBe(
      false,
    );
  });

  it("stops for an abandoned RUNNING record, whose process is gone", () => {
    expect(progressRefetchInterval(runProgress({ abandoned: true }))).toBe(
      false,
    );
  });

  it("does not poll before anything has been read", () => {
    expect(progressRefetchInterval(undefined)).toBe(false);
  });

  it("uses a bounded, human-scale interval", () => {
    expect(PROGRESS_POLL_MS).toBeGreaterThanOrEqual(1000);
    expect(PROGRESS_POLL_MS).toBeLessThanOrEqual(10_000);
  });
});
