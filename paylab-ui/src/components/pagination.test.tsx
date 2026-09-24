import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

const hrefFor = (trail: string[]) => `/list?pages=${trail.join(",")}`;

function renderPagination(trail: string[], nextCursor: string | null) {
  render(
    <Pagination trail={trail} nextCursor={nextCursor} hrefFor={hrefFor} />,
  );
}

describe("Pagination", () => {
  it("on the first page: Previous is disabled, page 1 is current, page 2 and Next lead on", () => {
    renderPagination([], "N1");

    const previous = screen.getByText("Previous").closest("[aria-disabled]");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("link", { name: /previous/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "href",
      "/list?pages=N1",
    );
    expect(screen.getByRole("link", { name: /next page/i })).toHaveAttribute(
      "href",
      "/list?pages=N1",
    );
  });

  it("in the middle: Previous goes back one page and visited pages link to themselves", () => {
    renderPagination(["a", "b"], "N3");

    expect(screen.getByText("3")).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /previous page/i }),
    ).toHaveAttribute("href", "/list?pages=a");
    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "href",
      "/list?pages=",
    );
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "href",
      "/list?pages=a",
    );
    expect(screen.getByRole("link", { name: "Page 4" })).toHaveAttribute(
      "href",
      "/list?pages=a,b,N3",
    );
    expect(screen.queryByText("More pages")).not.toBeInTheDocument();
  });

  it("collapses far-back pages into an ellipsis, keeping the first page reachable", () => {
    renderPagination(["a", "b", "c", "d", "e"], "N7");

    expect(screen.getByText("6")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 5" })).toHaveAttribute(
      "href",
      "/list?pages=a,b,c,d",
    );
    expect(screen.getByRole("link", { name: "Page 7" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Page 3" }),
    ).not.toBeInTheDocument();
  });

  it("on the last page: Next is disabled and no later page is invented", () => {
    renderPagination(["a"], null);

    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Next").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.queryByRole("link", { name: "Page 3" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /next page/i }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is a single page", () => {
    renderPagination([], null);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
