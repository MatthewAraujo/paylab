import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import PaymentPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const id = "11111111-1111-4111-8111-111111111111";
const payment = {
  id,
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

async function renderPage(paymentId = id) {
  render(await PaymentPage({ params: Promise.resolve({ id: paymentId }) }));
}

describe("Payment detail page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("loads the Payment by id from the API", async () => {
    fetchStub.mockResolvedValue(Response.json(payment));

    await renderPage();

    expect(fetchStub.mock.calls[0][0].url).toBe(
      `http://api.test/v1/payments/${id}`,
    );
    expect(
      screen.getByRole("heading", { name: "Payment", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("R$2,500.00")).toBeInTheDocument();
  });

  it("says so when the Payment does not exist, with the backend message", async () => {
    fetchStub.mockResolvedValue(
      Response.json(
        {
          code: "RESOURCE_NOT_FOUND",
          message: "The requested resource was not found.",
        },
        { status: 404 },
      ),
    );

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Payment not found");
    expect(
      screen.getByRole("link", { name: /all payments/i }),
    ).toBeInTheDocument();
  });

  it("rejects a malformed id with the backend validation message", async () => {
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

    await renderPage("not-a-uuid");

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid request");
  });

  it("reports an unreachable API and a missing key without inventing data", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );

    setKeyMissing(true);
    await renderPage();
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
      "PAYLAB_API_KEY",
    );
  });
});
