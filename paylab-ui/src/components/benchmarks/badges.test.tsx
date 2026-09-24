import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { badgeVariants } from "@/components/ui/badge";
import { ChangeBadge } from "./change-badge";
import { CompatibilityBadge } from "./compatibility-badge";
import { ProvenanceBadge } from "./provenance-badge";
import { RunStatusBadge } from "./run-status-badge";

/** The lucide icon name of the first svg inside the rendered badge. */
function iconOf(element: HTMLElement): string {
  const svg = element.querySelector("svg");
  const name = [...(svg?.classList ?? [])].find((c) => c.startsWith("lucide-"));
  return name ?? "";
}

describe("shared Badge variants", () => {
  it("adds a distinct semantic variant for every benchmark meaning", () => {
    const variants = [
      "completed",
      "improved",
      "running",
      "incomplete",
      "regressed",
      "stable",
      "imported",
      "incompatible",
      "new",
      "removed",
      "changed",
    ] as const;
    const base = badgeVariants({ variant: "default" });

    for (const variant of variants) {
      expect(badgeVariants({ variant }), variant).not.toBe(base);
    }
  });
});

describe("RunStatusBadge", () => {
  it("states each lifecycle status as text with its own icon, never by color alone", () => {
    const icons = new Set<string>();

    for (const status of ["RUNNING", "COMPLETED", "INCOMPLETE"] as const) {
      const { container, unmount } = render(<RunStatusBadge status={status} />);

      expect(screen.getByText(status)).toBeInTheDocument();
      const svg = container.querySelector("svg");
      expect(svg, status).toHaveAttribute("aria-hidden", "true");
      icons.add(iconOf(container));
      unmount();
    }

    expect(icons.size).toBe(3);
  });
});

describe("ProvenanceBadge", () => {
  it("labels native and imported Runs as an attribute, not a lifecycle status", () => {
    const { rerender } = render(<ProvenanceBadge kind="native" />);
    expect(screen.getByText("Native")).toBeInTheDocument();

    rerender(<ProvenanceBadge kind="imported" />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.queryByText("Native")).not.toBeInTheDocument();
  });
});

describe("ChangeBadge", () => {
  it("names Improved, Stable, and Regressed in text with a different shape each", () => {
    const icons = new Set<string>();

    for (const [classification, label] of [
      ["improved", "Improved"],
      ["stable", "Stable"],
      ["regressed", "Regressed"],
    ] as const) {
      const { container, unmount } = render(
        <ChangeBadge classification={classification} />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      icons.add(iconOf(container));
      unmount();
    }

    expect(icons.size).toBe(3);
  });
});

describe("CompatibilityBadge", () => {
  it.each([
    ["comparable", "Comparable"],
    ["new", "New"],
    ["removed", "Removed"],
    ["changed", "Changed definition"],
    ["environment-incompatible", "Environment incompatible"],
    ["dataset-incompatible", "Dataset incompatible"],
    ["not-recorded", "Not recorded"],
  ] as const)("says %s in words", (state, label) => {
    render(<CompatibilityBadge state={state} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("explains what new and removed scenarios mean", () => {
    const { container, rerender } = render(<CompatibilityBadge state="new" />);
    expect(container.firstElementChild).toHaveAttribute(
      "title",
      "No previous measurement",
    );

    rerender(<CompatibilityBadge state="removed" />);
    expect(container.firstElementChild).toHaveAttribute(
      "title",
      "Present only in the reference Run",
    );
  });
});
