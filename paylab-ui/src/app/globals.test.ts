import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Design-token checks for the benchmark area: readable text on the console surfaces and no
// motion for people who ask for none. The stylesheet is parsed as text; no browser is needed.

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function token(name: string): [number, number, number] {
  const match = css.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`Token --${name} is not an oklch() colour`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** oklch to linear sRGB (Bjorn Ottosson's matrices), clamped to the gamut. */
function luminance([l, c, h]: [number, number, number]): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const [hi, lo] = [
    luminance(token(foreground)),
    luminance(token(background)),
  ].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("colour tokens", () => {
  it.each([
    ["foreground", "background"],
    ["foreground", "card"],
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["success", "background"],
    ["success", "card"],
    ["destructive", "background"],
    ["destructive", "card"],
    ["primary", "background"],
  ])("%s text is readable on %s (AA, 4.5:1)", (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("motion", () => {
  it("disables animation and transitions when the user prefers reduced motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
