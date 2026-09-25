import { describe, expect, it } from "vitest";
import { logTailLines, logTailRange, TAIL_BYTES, TAIL_LINES } from "./log-tail";

describe("logTailRange", () => {
  it("reads the whole file when it is smaller than the window", () => {
    expect(logTailRange(100)).toEqual({ offset: 0, limit: TAIL_BYTES });
  });

  it("starts the window so that it ends at the size", () => {
    expect(logTailRange(10_000)).toEqual({
      offset: 10_000 - TAIL_BYTES,
      limit: TAIL_BYTES,
    });
  });
});

describe("logTailLines", () => {
  it("keeps every line of a chunk read from the start", () => {
    expect(logTailLines({ content: "a\nb\n", offset: 0 })).toEqual(["a", "b"]);
  });

  it("drops the first line of a chunk that starts mid-file, it is probably partial", () => {
    expect(logTailLines({ content: "rtial\nb\nc\n", offset: 500 })).toEqual([
      "b",
      "c",
    ]);
  });

  it("keeps a trailing line that has no newline yet", () => {
    expect(logTailLines({ content: "a\nb", offset: 0 })).toEqual(["a", "b"]);
  });

  it("returns only the last lines", () => {
    const content = `${Array.from({ length: TAIL_LINES + 5 }, (_, i) => `l${i}`).join("\n")}\n`;
    const lines = logTailLines({ content, offset: 0 });

    expect(lines).toHaveLength(TAIL_LINES);
    expect(lines.at(-1)).toBe(`l${TAIL_LINES + 4}`);
  });

  it("is empty for an empty chunk", () => {
    expect(logTailLines({ content: "", offset: 0 })).toEqual([]);
  });
});
