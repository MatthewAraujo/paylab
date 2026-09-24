import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { components } from "@/api/generated/schema";
import { PaymentDetail } from "./payment-detail";

type Payment = components["schemas"]["PaymentResponse"];

const succeeded: Payment = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  destinationAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  amount: 123456,
  currency: "BRL",
  status: "SUCCEEDED",
  failureReason: null,
  ledgerTransactionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  createdAt: "2026-09-01T10:05:30.000Z",
  updatedAt: "2026-09-01T10:05:31.000Z",
};

function field(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling;
}

describe("PaymentDetail", () => {
  it("shows the full intent and outcome of a settled Payment", () => {
    render(<PaymentDetail payment={succeeded} />);

    expect(field("Payment")).toHaveTextContent(succeeded.id);
    expect(field("Status")).toHaveTextContent("Succeeded");
    expect(field("Amount")).toHaveTextContent("R$1,234.56");
    expect(field("Currency")).toHaveTextContent("BRL");
    expect(field("Created")).toHaveTextContent("2026-09-01 10:05:30 UTC");
    expect(field("Updated")).toHaveTextContent("2026-09-01 10:05:31 UTC");
    expect(field("Source Account")).toHaveTextContent(
      succeeded.sourceAccountId,
    );
    expect(field("Destination Account")).toHaveTextContent(
      succeeded.destinationAccountId,
    );
  });

  it("links each Account to its Payments and shows the Ledger Transaction id as evidence", () => {
    render(<PaymentDetail payment={succeeded} />);

    expect(
      screen.getByRole("link", { name: succeeded.sourceAccountId }),
    ).toHaveAttribute(
      "href",
      `/payments?accountId=${succeeded.sourceAccountId}`,
    );
    expect(field("Ledger Transaction")).toHaveTextContent(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });

  it("explains that a failed Payment has no ledger fact", () => {
    render(
      <PaymentDetail
        payment={{
          ...succeeded,
          status: "FAILED",
          failureReason: "INSUFFICIENT_FUNDS",
          ledgerTransactionId: null,
        }}
      />,
    );

    expect(field("Status")).toHaveTextContent("Failed");
    expect(field("Failure reason")).toHaveTextContent("INSUFFICIENT_FUNDS");
    expect(field("Ledger Transaction")).toHaveTextContent(
      "None: no ledger fact was written",
    );
  });

  it("has a link back to the list", () => {
    render(<PaymentDetail payment={succeeded} />);

    expect(screen.getByRole("link", { name: /all payments/i })).toHaveAttribute(
      "href",
      "/payments",
    );
  });
});
