/** Renders an ISO instant in UTC, so operators comparing events never depend on a local timezone. */
export function formatTimestamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
