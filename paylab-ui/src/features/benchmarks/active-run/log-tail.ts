/** How much of the end of the log is read on each refresh, and how many lines are shown. */
export const TAIL_BYTES = 4096;
export const TAIL_LINES = 20;

/** The bounded range that ends at the file's current size (the whole file when it is small). */
export function logTailRange(sizeBytes: number): {
  offset: number;
  limit: number;
} {
  return { offset: Math.max(0, sizeBytes - TAIL_BYTES), limit: TAIL_BYTES };
}

/**
 * The lines of a chunk worth showing. A chunk that starts inside the file begins in the middle
 * of a line, so its first line is dropped rather than shown cut.
 */
export function logTailLines(chunk: {
  content: string;
  offset: number;
}): string[] {
  const lines = chunk.content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (chunk.offset > 0) lines.shift();
  return lines.slice(-TAIL_LINES);
}
