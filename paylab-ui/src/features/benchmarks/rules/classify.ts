import type { MetricDirection } from "./types";

/**
 * A presentation tolerance, not a claim of statistical significance: a change within
 * -5% and +5% (both inclusive) is Stable.
 */
export const STABLE_TOLERANCE_PERCENT = 5;

// Absorbs binary floating-point error so that exactly +-5% (for example 1 to 1.05) is Stable.
const RELATIVE_EPSILON = 1e-9;

export type Classification = "improved" | "stable" | "regressed";

export type Change =
  | {
      kind: "compared";
      classification: Classification;
      absoluteDelta: number;
      /** Null when the reference is zero: a percentage would be mathematically misleading. */
      percentDelta: number | null;
    }
  /** An informational metric (for example a sample count): values shown, never classified. */
  | {
      kind: "informational";
      absoluteDelta: number;
      percentDelta: number | null;
    }
  /** A value exists on one side only. It is never treated as zero. */
  | { kind: "not-recorded" };

/**
 * Direction-aware change between two comparable values.
 *
 * Reference zero follows the approved design: 0 to 0 is Stable (delta 0), and a move away from
 * zero is classified by direction (deadlocks 0 to 3 regress) with no percentage. The API's pure
 * `classifyChange` (used by no endpoint) reports this case as not comparable; the console
 * deliberately does not, because that would hide exactly the changes worth seeing.
 */
export function classifyChange(input: {
  current: number | undefined;
  reference: number | undefined;
  direction: MetricDirection;
}): Change {
  const { current, reference, direction } = input;
  if (current === undefined || reference === undefined) {
    return { kind: "not-recorded" };
  }

  const absoluteDelta = current - reference;
  const percentDelta =
    reference === 0 ? null : (absoluteDelta / Math.abs(reference)) * 100;

  if (direction === "NEUTRAL") {
    return { kind: "informational", absoluteDelta, percentDelta };
  }

  const withinBand =
    reference === 0
      ? absoluteDelta === 0
      : Math.abs(absoluteDelta) <=
        (STABLE_TOLERANCE_PERCENT / 100 + RELATIVE_EPSILON) *
          Math.abs(reference);

  let classification: Classification = "stable";
  if (!withinBand) {
    const favorable =
      direction === "HIGHER_IS_BETTER" ? absoluteDelta > 0 : absoluteDelta < 0;
    classification = favorable ? "improved" : "regressed";
  }
  return { kind: "compared", classification, absoluteDelta, percentDelta };
}
