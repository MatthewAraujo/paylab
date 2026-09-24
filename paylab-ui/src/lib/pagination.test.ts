import { describe, expect, it } from "vitest";
import { currentCursor, MAX_TRAIL, parseTrail, withTrail } from "./pagination";

describe("parseTrail", () => {
  it("reads the comma-separated cursors of the pages visited after the first", () => {
    expect(parseTrail("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("is empty for a missing, blank or repeated-empty value", () => {
    expect(parseTrail(undefined)).toEqual([]);
    expect(parseTrail("")).toEqual([]);
    expect(parseTrail(" , ,")).toEqual([]);
  });

  it("uses the first value when the parameter is repeated and trims entries", () => {
    expect(parseTrail([" a , b", "c"])).toEqual(["a", "b"]);
  });

  it("caps the length so a crafted URL cannot grow without bound", () => {
    const long = Array.from({ length: MAX_TRAIL + 50 }, (_, i) => `c${i}`).join(
      ",",
    );
    expect(parseTrail(long)).toHaveLength(MAX_TRAIL);
  });
});

describe("currentCursor", () => {
  it("is the last cursor of the trail: the API position of the page being shown", () => {
    expect(currentCursor([])).toBeUndefined();
    expect(currentCursor(["a", "b"])).toBe("b");
  });
});

describe("withTrail", () => {
  it("appends the trail to a bare path", () => {
    expect(withTrail("/accounts", ["a", "b"])).toBe("/accounts?pages=a,b");
  });

  it("appends to an existing query, and leaves the URL alone for the first page", () => {
    expect(withTrail("/payments?status=FAILED", ["a"])).toBe(
      "/payments?status=FAILED&pages=a",
    );
    expect(withTrail("/payments?status=FAILED", [])).toBe(
      "/payments?status=FAILED",
    );
  });

  it("encodes each cursor but keeps the separating commas readable", () => {
    expect(withTrail("/x", ["a b", "c/d"])).toBe("/x?pages=a%20b,c%2Fd");
  });
});
