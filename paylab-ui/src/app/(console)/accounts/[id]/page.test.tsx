import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStub,
  serverClientModule,
  setKeyMissing,
} from "@/test/server-client-stub";
import AccountPage from "./page";

vi.mock("@/api/server-client", () => serverClientModule());

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const notFound = {
  code: "RESOURCE_NOT_FOUND",
  message: "The requested resource was not found.",
};

async function renderPage() {
  render(await AccountPage({ params: Promise.resolve({ id }) }));
}

describe("Account detail page", () => {
  beforeEach(() => {
    setKeyMissing(false);
    fetchStub.mockReset();
  });

  it("loads the Wallet and its Balance", async () => {
    fetchStub.mockImplementation(async (request) =>
      request.url.endsWith("/balance")
        ? Response.json({ accountId: id, balance: 123456, currency: "BRL" })
        : Response.json({ id, kind: "WALLET", currency: "BRL" }),
    );

    await renderPage();

    const urls = fetchStub.mock.calls.map(([request]) => request.url).sort();
    expect(urls).toEqual([
      `http://api.test/v1/accounts/${id}`,
      `http://api.test/v1/accounts/${id}/balance`,
    ]);
    expect(screen.getByText("R$1,234.56")).toBeInTheDocument();
  });

  it("shows a not-found state for another Merchant's or unknown Wallet", async () => {
    fetchStub.mockResolvedValue(Response.json(notFound, { status: 404 }));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Wallet not found");
    expect(screen.getByRole("link", { name: /all accounts/i })).toHaveAttribute(
      "href",
      "/accounts",
    );
  });

  it("shows the Wallet with a Balance error when only the Balance call fails", async () => {
    fetchStub.mockImplementation(async (request) =>
      request.url.endsWith("/balance")
        ? Response.json({ message: "boom" }, { status: 500 })
        : Response.json({ id, kind: "WALLET", currency: "BRL" }),
    );

    await renderPage();

    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Balance could not be loaded",
    );
  });
});
