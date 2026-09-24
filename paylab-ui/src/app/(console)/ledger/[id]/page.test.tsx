import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import LedgerAccountPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  ledgerTransactionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  direction: "CREDIT",
  amount: 250000,
  createdAt: "2026-09-01T10:05:30.000Z",
};

async function renderPage(searchParams: Record<string, string> = {}) {
  render(
    await LedgerAccountPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("Wallet Ledger page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("loads the Wallet's entries, forwarding the cursor", async () => {
    fetchStub.mockResolvedValue(
      Response.json({ items: [entry], nextCursor: null }),
    );

    await renderPage({ pages: "C1" });

    expect(fetchStub.mock.calls[0][0].url).toBe(
      `http://api.test/v1/accounts/${id}/entries?cursor=C1`,
    );
    expect(screen.getByText("Credit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /wallet/i })).toHaveAttribute(
      "href",
      `/accounts/${id}`,
    );
  });

  it("shows a not-found state for another Merchant's Wallet", async () => {
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

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ledger Entries not found",
    );
    expect(screen.getByRole("link", { name: /all ledgers/i })).toHaveAttribute(
      "href",
      "/ledger",
    );
  });
});
