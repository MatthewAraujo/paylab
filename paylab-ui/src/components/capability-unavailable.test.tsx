import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityUnavailable } from "./capability-unavailable";

describe("CapabilityUnavailable", () => {
  it("explains an incomplete API contract without offering illustrative data", () => {
    render(
      <CapabilityUnavailable
        title="Accounts contract is incomplete"
        description="The route exists, but OpenAPI does not describe its data yet."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Accounts contract is incomplete" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
  });
});
