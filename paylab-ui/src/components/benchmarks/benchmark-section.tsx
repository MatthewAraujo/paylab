import { type ReactNode, useId } from "react";

type BenchmarkSectionProps = {
  title: string;
  /** Controls placed on the right of the heading (a selector, a link). */
  actions?: ReactNode;
  children: ReactNode;
};

/** A named region of a benchmark view: the heading names the region for assistive technology. */
export function BenchmarkSection({
  title,
  actions,
  children,
}: Readonly<BenchmarkSectionProps>) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
