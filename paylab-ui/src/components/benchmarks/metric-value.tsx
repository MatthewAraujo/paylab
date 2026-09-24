type MetricValueProps = {
  /** Already formatted by the presentation rules; null or undefined means it was not recorded. */
  value: string | null | undefined;
  unit?: string;
};

/** A measurement in aligned monospace with its unit; an absent value is never rendered as zero. */
export function MetricValue({ value, unit }: Readonly<MetricValueProps>) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">Not recorded</span>;
  }

  return (
    <span className="font-mono tabular-nums">
      <span>{value}</span>
      {unit ? (
        <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
      ) : null}
    </span>
  );
}
