import {
  type ApiFailure,
  failureFromResponse,
  failureFromThrown,
} from "@/api/failures";
import type { components } from "@/api/generated/schema";
import { createServerApiClient } from "@/api/server-client";
import type { PaymentFilters } from "./payments-filters";

export type PaymentPage = components["schemas"]["PaymentPageResponse"];
export type Payment = components["schemas"]["PaymentResponse"];

export type PaymentsResult = { ok: true; page: PaymentPage } | ApiFailure;
export type PaymentResult = { ok: true; payment: Payment } | ApiFailure;

/** Loads one page of the Merchant's Payments. Every failure becomes a message the operator can act on. */
export async function loadPayments(
  filters: PaymentFilters,
): Promise<PaymentsResult> {
  try {
    const { data, error, response } = await createServerApiClient().GET(
      "/v1/payments",
      { params: { query: filters } },
    );

    return data
      ? { ok: true, page: data }
      : failureFromResponse(response, error, "Payments");
  } catch (error) {
    return failureFromThrown(error);
  }
}

/** Loads one Payment. An unknown id and another Merchant's Payment are the same 404 from the API. */
export async function loadPayment(id: string): Promise<PaymentResult> {
  try {
    const { data, error, response } = await createServerApiClient().GET(
      "/v1/payments/{id}",
      { params: { path: { id } } },
    );

    return data
      ? { ok: true, payment: data }
      : failureFromResponse(response, error, "Payment");
  } catch (error) {
    return failureFromThrown(error);
  }
}
