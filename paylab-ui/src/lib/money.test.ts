import { describe, expect, it } from "vitest";
import { formatBrl } from "./money";

describe("formatBrl", () => {
  it("formats integer centavos without floating-point input", () => {
    expect(formatBrl(35_090)).toBe("R$350.90");
  });
});
