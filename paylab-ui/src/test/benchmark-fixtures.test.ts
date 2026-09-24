import { describe, expect, it } from "vitest";
import {
  baselineSelection,
  capabilityOffBody,
  notFoundBody,
  runDetail,
  runListItem,
  scenario,
} from "./benchmark-fixtures";

describe("benchmark fixtures", () => {
  it("return fresh objects, so one test can never leak state into another", () => {
    const first = runDetail();
    first.scenarios[0].metrics[0].value = -1;
    first.environment.details.node = "changed";

    const second = runDetail();

    expect(second.scenarios[0].metrics[0].value).toBe(164.4);
    expect(second.environment.details.node).toBe("24.5.0");
  });

  it("apply overrides on top of a valid default", () => {
    expect(runListItem({ status: "INCOMPLETE" }).status).toBe("INCOMPLETE");
    expect(scenario({ id: "x" }).group).toBe("t14");
  });

  it("model a selection that leaves a reviewable Git change", () => {
    expect(baselineSelection().git).toMatchObject({
      baselineChangePending: true,
      dirtyFiles: ["bench/baseline.json"],
    });
  });

  it("distinguish a missing Run (with a code) from the capability being off (without one)", () => {
    expect(notFoundBody()).toHaveProperty("code", "BENCHMARK_RUN_NOT_FOUND");
    expect(capabilityOffBody()).not.toHaveProperty("code");
  });
});
