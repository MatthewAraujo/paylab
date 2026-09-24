import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntriesList } from "./entries-list";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const credit = {
  id: "11111111-1111-4111-8111-111111111111",
  ledgerTransactionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  direction: "CREDIT" as const,
  amount: 250000,
  createdAt: "2026-09-01T10:05:30.000Z",
};
const debit = {
  ...credit,
  id: "22222222-2222-4222-8222-222222222222",
  direction: "DEBIT" as const,
  amount: 5,
};

describe("EntriesList", () => {
  it("shows direction as text and icon, with the unsigned Amount", () => {
    render(
      <EntriesList
        page={{ items: [credit, debit], nextCursor: null }}
        accountId={accountId}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Credit")).toBeInTheDocument();
    expect(within(rows[0]).getByText("R$2,500.00")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Debit")).toBeInTheDocument();
    expect(within(rows[1]).getByText("R$0.05")).toBeInTheDocument();
    expect(screen.queryByText(/-R\$|\+R\$/)).not.toBeInTheDocument();
  });

  it("keeps the full Ledger Transaction id available and the time in UTC", () => {
    render(
      <EntriesList
        page={{ items: [credit], nextCursor: null }}
        accountId={accountId}
      />,
    );

    expect(screen.getByText(credit.ledgerTransactionId)).toBeInTheDocument();
    expect(screen.getByText("2026-09-01 10:05:30 UTC")).toBeInTheDocument();
  });

  it("pages with the cursor under the Wallet's ledger URL", () => {
    render(
      <EntriesList
        page={{ items: [credit], nextCursor: "NEXT" }}
        accountId={accountId}
      />,
    );

    expect(
      screen.getByRole("link", { name: /older entries/i }),
    ).toHaveAttribute("href", `/ledger/${accountId}?cursor=NEXT`);
  });

  it("explains an empty history", () => {
    render(
      <EntriesList
        page={{ items: [], nextCursor: null }}
        accountId={accountId}
      />,
    );

    expect(screen.getByText("No Ledger Entries yet")).toBeInTheDocument();
  });
});
