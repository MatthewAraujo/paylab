import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountDetail } from "./account-detail";

const account = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "WALLET",
  currency: "BRL",
};

function field(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling;
}

describe("AccountDetail", () => {
  it("shows the Wallet and its Balance as derived ledger state", () => {
    render(
      <AccountDetail
        account={account}
        balance={{
          ok: true,
          data: { accountId: account.id, balance: 75000, currency: "BRL" },
        }}
      />,
    );

    expect(field("Wallet")).toHaveTextContent(account.id);
    expect(field("Currency")).toHaveTextContent("BRL");
    expect(field("Balance")).toHaveTextContent("R$750.00");
    expect(screen.getByText(/credits minus debits/i)).toBeInTheDocument();
  });

  it("links to the Wallet's Ledger Entries and Payments", () => {
    render(
      <AccountDetail
        account={account}
        balance={{
          ok: true,
          data: { accountId: account.id, balance: 0, currency: "BRL" },
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: /ledger entries/i }),
    ).toHaveAttribute("href", `/ledger/${account.id}`);
    expect(screen.getByRole("link", { name: /payments/i })).toHaveAttribute(
      "href",
      `/payments?accountId=${account.id}`,
    );
  });

  it("keeps the Wallet visible when only the Balance fails to load", () => {
    render(
      <AccountDetail
        account={account}
        balance={{
          ok: false,
          title: "Balance could not be loaded",
          message: "The API answered with HTTP 500.",
        }}
      />,
    );

    expect(field("Wallet")).toHaveTextContent(account.id);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Balance could not be loaded",
    );
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});
