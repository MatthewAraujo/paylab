import { Fragment } from "react";
import {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Pagination as PaginationRoot,
} from "@/components/ui/pagination";

/**
 * Previous, numbered pages and Next for a cursor-only API. Only pages that are known to exist
 * are numbered: the first, the ones just behind the current page, the current one, and the next
 * one when the API returned a `nextCursor`. There is no total and no "last page" number.
 * `hrefFor(trail)` builds the URL of the page reached by that trail of cursors (see lib/pagination).
 */
export function Pagination({
  trail,
  nextCursor,
  hrefFor,
}: Readonly<{
  trail: string[];
  nextCursor: string | null;
  hrefFor: (trail: string[]) => string;
}>) {
  if (trail.length === 0 && !nextCursor) return null;

  const current = trail.length + 1;
  const pages = new Set([1, current - 1, current]);
  if (nextCursor) pages.add(current + 1);
  const numbers = [...pages].filter((page) => page >= 1).sort((a, b) => a - b);

  const hrefOf = (page: number) =>
    page > current
      ? hrefFor([...trail, nextCursor as string])
      : hrefFor(trail.slice(0, page - 1));

  return (
    <PaginationRoot>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={current > 1 ? hrefOf(current - 1) : undefined}
          />
        </PaginationItem>
        {numbers.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page - numbers[index - 1] > 1 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationLink
                href={hrefOf(page)}
                isActive={page === current}
                aria-label={`Page ${page}`}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          </Fragment>
        ))}
        <PaginationItem>
          <PaginationNext href={nextCursor ? hrefOf(current + 1) : undefined} />
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}
