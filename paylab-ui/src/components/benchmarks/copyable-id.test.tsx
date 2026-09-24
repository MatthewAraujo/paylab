import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyableId, compactId } from "./copyable-id";

const commit = "8a2c91f3d4b5e6a7091827364554637281009abc";
const runA = "2026-09-23T10-00-00Z-abc1234";
const runB = "2026-09-23T10-30-00Z-abc1234";

describe("compactId", () => {
  it("keeps the start and the end, so ids that share a prefix stay different", () => {
    expect(compactId(runA)).not.toBe(compactId(runB));
    expect(compactId(commit)).toContain("…");
    expect(compactId(commit).length).toBeLessThan(commit.length);
  });

  it("leaves a short value whole", () => {
    expect(compactId("abc1234")).toBe("abc1234");
  });

  it("never turns two different values into the same text within one context", () => {
    const values = [runA, runB, `${runA}x`, "2026-09-24T10-00-00Z-abc1234"];

    expect(new Set(values.map((value) => compactId(value))).size).toBe(
      values.length,
    );
  });
});

describe("CopyableId", () => {
  it("shows a compact form and keeps the full value for assistive technology and the tooltip", () => {
    render(<CopyableId label="commit" value={commit} />);

    expect(screen.getByText(compactId(commit))).toBeInTheDocument();
    expect(screen.getByText(commit)).toHaveClass("sr-only");
    expect(screen.getByTitle(commit)).toBeInTheDocument();
  });

  it("copies the full value and announces it politely", async () => {
    const user = userEvent.setup();
    render(<CopyableId label="commit" value={commit} />);

    await user.click(screen.getByRole("button", { name: "Copy commit" }));

    expect(await navigator.clipboard.readText()).toBe(commit);
    expect(screen.getByRole("status")).toHaveTextContent("Copied commit");
  });

  it("says so when the browser refuses to copy", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    render(<CopyableId label="Run id" value={runA} />);

    await user.click(screen.getByRole("button", { name: "Copy Run id" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not copy Run id",
    );
  });

  it("reveals and hides the full value", async () => {
    const user = userEvent.setup();
    render(<CopyableId label="commit" value={commit} />);
    const toggle = screen.getByRole("button", { name: "Show full commit" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(
      screen.getByRole("button", { name: "Hide full commit" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(commit)).not.toHaveClass("sr-only");
    expect(screen.queryByText(compactId(commit))).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide full commit" }));

    expect(screen.getByText(compactId(commit))).toBeInTheDocument();
  });
});
