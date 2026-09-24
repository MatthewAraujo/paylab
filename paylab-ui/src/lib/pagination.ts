// The API paginates with opaque keyset cursors only (ADR 0008 of the backend): there is no
// page number, no total and no jump. To offer Previous and numbered pages anyway, the URL
// carries the trail of cursors of the pages visited after the first one:
//
//   /payments                 page 1 (no cursor)
//   /payments?pages=c1        page 2, fetched with cursor c1
//   /payments?pages=c1,c2     page 3, fetched with cursor c2
//
// Previous, and any page already visited, are the trail cut short; Next appends the
// `nextCursor` of the page on screen. The trail is state in the URL, never on the server.

export const MAX_TRAIL = 100;

/** The visited-pages trail from the `pages` search parameter. */
export function parseTrail(value: string | string[] | undefined): string[] {
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "")
    .split(",")
    .map((cursor) => cursor.trim())
    .filter(Boolean)
    .slice(0, MAX_TRAIL);
}

/** The API cursor of the page being shown: the last one in the trail. */
export function currentCursor(trail: string[]): string | undefined {
  return trail[trail.length - 1];
}

/** `path` (which may already carry a query) with the trail appended; the first page has none. */
export function withTrail(path: string, trail: string[]): string {
  if (trail.length === 0) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}pages=${trail.map(encodeURIComponent).join(",")}`;
}
