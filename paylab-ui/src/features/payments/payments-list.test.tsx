import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { components } from "@/api/generated/schema";
import { PaymentsList } from "./payments-list";

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

const failed: Payment = {
  ...succeeded,
  id: "22222222-2222-4222-8222-222222222222",
  amount: 5,
  status: "FAILED",
  failureReason: "INSUFFICIENT_FUNDS",
  ledgerTransactionId: null,
};

describe("PaymentsList", () => {
  it("shows each Payment with BRL amount, UTC time, accounts and a textual status", () => {
    render(
      <PaymentsList
        page={{ items: [succeeded, failed], nextCursor: null }}
        filters={{}}
        trail={[]}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText("R$1,234.56")).toBeInTheDocument();
    expect(first.getByText("2026-09-01 10:05:30 UTC")).toBeInTheDocument();
    expect(first.getByText(succeeded.sourceAccountId)).toBeInTheDocument();
    expect(first.getByText(succeeded.destinationAccountId)).toBeInTheDocument();
    expect(first.getByText("Succeeded")).toBeInTheDocument();
  });

  it("abbreviates ids visually, keeps the full id, and links an Account to its own Payments", () => {
    render(
      <PaymentsList
        page={{ items: [succeeded], nextCursor: null }}
        filters={{ status: "SUCCEEDED" }}
        trail={[]}
      />,
    );

    const link = screen.getByRole("link", { name: succeeded.sourceAccountId });
    expect(link).toHaveAttribute(
      "href",
      `/payments?status=SUCCEEDED&accountId=${succeeded.sourceAccountId}`,
    );
    expect(link).toHaveTextContent("aaaaaaaa…");
    expect(screen.getByText(succeeded.id)).toBeInTheDocument();
  });

  it("links each Payment id to its detail page", () => {
    render(
      <PaymentsList
        page={{ items: [succeeded], nextCursor: null }}
        filters={{}}
        trail={[]}
      />,
    );

    expect(screen.getByRole("link", { name: succeeded.id })).toHaveAttribute(
      "href",
      `/payments/${succeeded.id}`,
    );
  });

  it("presents a failed Payment as a business outcome with its reason, not as an error", () => {
    render(
      <PaymentsList
        page={{ items: [failed], nextCursor: null }}
        filters={{}}
        trail={[]}
      />,
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("INSUFFICIENT_FUNDS")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("paginates with Previous, page numbers and Next, keeping the active filters", () => {
    render(
      <PaymentsList
        page={{ items: [succeeded], nextCursor: "CURSOR" }}
        filters={{ status: "SUCCEEDED" }}
        trail={["C1"]}
      />,
    );

    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /next page/i })).toHaveAttribute(
      "href",
      "/payments?status=SUCCEEDED&pages=C1,CURSOR",
    );
    expect(
      screen.getByRole("link", { name: /previous page/i }),
    ).toHaveAttribute("href", "/payments?status=SUCCEEDED");
    expect(screen.queryByText(/older/i)).not.toBeInTheDocument();
  });

  it("shows no pagination when everything fits on one page", () => {
    render(
      <PaymentsList
        page={{ items: [succeeded], nextCursor: null }}
        filters={{}}
        trail={[]}
      />,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("explains an empty Merchant differently from an empty filter result", () => {
    const { rerender } = render(
      <PaymentsList
        page={{ items: [], nextCursor: null }}
        filters={{}}
        trail={[]}
      />,
    );
    expect(screen.getByText("No Payments yet")).toBeInTheDocument();

    rerender(
      <PaymentsList
        page={{ items: [], nextCursor: null }}
        filters={{ status: "FAILED" }}
        trail={[]}
      />,
    );
    expect(
      screen.getByText("No Payments match these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /clear filters/i }),
    ).toHaveAttribute("href", "/payments");
  });
});
