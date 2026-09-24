/** First 8 characters for scanning; the full id stays in the tooltip and for screen readers. */
export function ShortId({ id }: Readonly<{ id: string }>) {
  return (
    <span title={id}>
      <span aria-hidden="true">{id.slice(0, 8)}…</span>
      <span className="sr-only">{id}</span>
    </span>
  );
}
