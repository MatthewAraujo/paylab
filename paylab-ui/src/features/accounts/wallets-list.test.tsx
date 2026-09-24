import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletsList } from "./wallets-list";

const wallet = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "WALLET",
  currency: "BRL",
  createdAt: "2026-09-01T10:05:30.000Z",
};

describe("WalletsList", () => {
  it("lists Wallets with a link to each one under the given base path", () => {
    render(
      <WalletsList
        page={{ items: [wallet], nextCursor: null }}
        basePath="/accounts"
      />,
    );

    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: wallet.id })).toHaveAttribute(
      "href",
      `/accounts/${wallet.id}`,
    );
    expect(row.getByText("BRL")).toBeInTheDocument();
    expect(row.getByText("2026-09-01 10:05:30 UTC")).toBeInTheDocument();
  });

  it("points Ledger rows at the Ledger and pages with the cursor", () => {
    render(
      <WalletsList
        page={{ items: [wallet], nextCursor: "NEXT" }}
        basePath="/ledger"
      />,
    );

    expect(screen.getByRole("link", { name: wallet.id })).toHaveAttribute(
      "href",
      `/ledger/${wallet.id}`,
    );
    expect(
      screen.getByRole("link", { name: /older wallets/i }),
    ).toHaveAttribute("href", "/ledger?cursor=NEXT");
  });

  it("explains an empty Merchant", () => {
    render(
      <WalletsList
        page={{ items: [], nextCursor: null }}
        basePath="/accounts"
      />,
    );

    expect(screen.getByText("No Wallets yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
