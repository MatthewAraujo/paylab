import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import DashboardPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const emptyReport = { from: "2026-09-04", to: "2026-09-10", items: [] };

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await DashboardPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Dashboard page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to the last 7 UTC days and asks the API for that range", async () => {
    fetchStub.mockResolvedValue(Response.json(emptyReport));

    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    const url = new URL(fetchStub.mock.calls[0][0].url);
    expect(url.pathname).toBe("/v1/reports/daily");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "2026-09-04",
      to: "2026-09-10",
    });
  });

  it("uses the range from the URL and keeps the form filled in", async () => {
    fetchStub.mockResolvedValue(
      Response.json({ from: "2026-09-01", to: "2026-09-03", items: [] }),
    );

    await renderPage({ from: "2026-09-01", to: "2026-09-03" });

    expect(
      Object.fromEntries(new URL(fetchStub.mock.calls[0][0].url).searchParams),
    ).toEqual({
      from: "2026-09-01",
      to: "2026-09-03",
    });
    expect(screen.getByLabelText("From (UTC)")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("To (UTC)")).toHaveValue("2026-09-03");
  });

  it("renders the report figures from the API", async () => {
    fetchStub.mockResolvedValue(
      Response.json({
        ...emptyReport,
        items: [
          { date: "2026-09-09", status: "SUCCEEDED", count: 3, volume: 450000 },
        ],
      }),
    );

    await renderPage();

    expect(
      screen.getByText("R$4,500.00", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("shows the backend's message for a range it rejects", async () => {
    fetchStub.mockResolvedValue(
      Response.json(
        {
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "Invalid request. Check the fields and try again.",
        },
        { status: 422 },
      ),
    );

    await renderPage({ from: "2026-09-05", to: "2026-09-01" });

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid request");
  });

  it("reports a missing key without showing placeholder figures", async () => {
    setKeyMissing(true);

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("PAYLAB_API_KEY");
    expect(screen.queryByText("Payments")).not.toBeInTheDocument();
  });
});
