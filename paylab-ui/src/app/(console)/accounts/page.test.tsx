import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import AccountsPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const wallet = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "WALLET",
  currency: "BRL",
  createdAt: "2026-09-01T10:05:30.000Z",
};

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await AccountsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Accounts page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("lists the Merchant's Wallets and forwards the cursor", async () => {
    fetchStub.mockResolvedValue(
      Response.json({ items: [wallet], nextCursor: null }),
    );

    await renderPage({ cursor: "C1" });

    expect(
      screen.getByRole("heading", { name: "Accounts", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: wallet.id })).toBeInTheDocument();
    expect(fetchStub.mock.calls[0][0].url).toBe(
      "http://api.test/v1/accounts?cursor=C1",
    );
  });

  it("offers no way to create a Wallet: the console is read-only", async () => {
    fetchStub.mockResolvedValue(Response.json({ items: [], nextCursor: null }));

    await renderPage();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reports failures instead of showing data", async () => {
    setKeyMissing(true);

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("PAYLAB_API_KEY");
  });
});
