import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import PaymentsPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const payment = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  destinationAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  amount: 250000,
  currency: "BRL",
  status: "SUCCEEDED",
  failureReason: null,
  ledgerTransactionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  createdAt: "2026-09-01T10:05:30.000Z",
  updatedAt: "2026-09-01T10:05:31.000Z",
};

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await PaymentsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Payments page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("lists the Merchant's Payments from the API", async () => {
    fetchStub.mockResolvedValue(
      Response.json({ items: [payment], nextCursor: null }),
    );

    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Payments", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("R$2,500.00")).toBeInTheDocument();
    expect(fetchStub.mock.calls[0][0].url).toBe("http://api.test/v1/payments");
  });

  it("forwards the filters and the last cursor of the page trail to the API", async () => {
    fetchStub.mockResolvedValue(Response.json({ items: [], nextCursor: null }));

    await renderPage({ status: "FAILED", from: "2026-09-01", pages: "C0,C1" });

    const url = new URL(fetchStub.mock.calls[0][0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "FAILED",
      from: "2026-09-01",
      cursor: "C1",
    });
  });

  it("keeps the filter form filled in with the current filters", async () => {
    fetchStub.mockResolvedValue(Response.json({ items: [], nextCursor: null }));

    await renderPage({ status: "FAILED", accountId: "abc" });

    expect(screen.getByLabelText("Status")).toHaveValue("FAILED");
    expect(screen.getByLabelText("Account id")).toHaveValue("abc");
  });

  it("renders an API validation error with the backend message and a retry link", async () => {
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

    await renderPage({ accountId: "not-a-uuid" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid request. Check the fields");
    expect(screen.getByRole("link", { name: /retry/i })).toHaveAttribute(
      "href",
      "/payments?accountId=not-a-uuid",
    );
  });

  it("tells the operator when the API is unreachable, without inventing data", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains a missing PAYLAB_API_KEY instead of failing silently", async () => {
    setKeyMissing(true);

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("PAYLAB_API_KEY");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("reports an authentication failure from the API", async () => {
    fetchStub.mockResolvedValue(
      Response.json(
        { statusCode: 401, message: "Invalid API key", error: "Unauthorized" },
        { status: 401 },
      ),
    );

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /api key was rejected/i,
    );
  });
});
