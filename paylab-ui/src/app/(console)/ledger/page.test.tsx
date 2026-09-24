import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import LedgerPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const wallet = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "WALLET",
  currency: "BRL",
  createdAt: "2026-09-01T10:05:30.000Z",
};

describe("Ledger page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("lists Wallets that lead to their Ledger Entries", async () => {
    fetchStub.mockResolvedValue(
      Response.json({ items: [wallet], nextCursor: null }),
    );

    render(await LedgerPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Ledger", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: wallet.id })).toHaveAttribute(
      "href",
      `/ledger/${wallet.id}`,
    );
  });

  it("reports an unreachable API", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));

    render(await LedgerPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );
  });
});
