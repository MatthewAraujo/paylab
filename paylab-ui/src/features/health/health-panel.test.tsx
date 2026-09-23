import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthPanel } from "./health-panel";

describe("HealthPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the identity returned by the live health contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            app: "paylab-api",
            environment: "development",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HealthPanel apiBaseUrl="http://localhost:3333" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("paylab-api")).toBeInTheDocument();
    expect(screen.getByText("development")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });
});
