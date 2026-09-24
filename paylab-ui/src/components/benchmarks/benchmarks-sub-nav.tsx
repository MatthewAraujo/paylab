"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const views = [
  { href: "/benchmarks", label: "Overview" },
  { href: "/benchmarks/compare", label: "Comparison" },
  { href: "/benchmarks/trends", label: "Historical trends" },
] as const;

/**
 * Route navigation between the benchmark views. These are real routes, so the current one is
 * marked with `aria-current` on a link, not an in-page tab widget. A Run detail route belongs to
 * none of the three views, so none is marked there.
 */
export function BenchmarksSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Benchmark views" className="mb-8 flex flex-wrap gap-2">
      {views.map(({ href, label }) => {
        const current = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current &&
                "border-primary/60 bg-accent text-accent-foreground shadow-[inset_0_-2px_0_var(--primary)]",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
