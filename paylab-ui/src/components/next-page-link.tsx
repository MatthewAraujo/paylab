import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** The only paging control: the API is cursor-only, so there is no page number and no "previous". */
export function NextPageLink({
  href,
  children,
}: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <div className="flex justify-end border-t px-4 py-3">
      <Link
        href={href}
        className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        {children} <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
