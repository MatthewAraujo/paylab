import { MissingApiKeyError } from "@/api/server-client";
import { getApiBaseUrl } from "@/lib/env";

export type ApiFailure = {
  ok: false;
  title: string;
  message: string;
  notFound?: boolean;
};

/** An HTTP answer that carried no data, described for the operator. */
export function failureFromResponse(
  response: Response,
  error: unknown,
  subject: string,
): ApiFailure {
  if (response.status === 401) {
    return {
      ok: false,
      title: "API key rejected",
      message:
        "The API key was rejected. Check that PAYLAB_API_KEY belongs to a provisioned Merchant.",
    };
  }

  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : `The API answered with HTTP ${response.status}.`;

  if (response.status === 404) {
    return {
      ok: false,
      title: `${subject} not found`,
      message,
      notFound: true,
    };
  }
  return { ok: false, title: `${subject} could not be loaded`, message };
}

/** A request that never produced an answer: no key configured, or the API is unreachable. */
export function failureFromThrown(error: unknown): ApiFailure {
  if (error instanceof MissingApiKeyError) {
    return {
      ok: false,
      title: "API key not configured",
      message: error.message,
    };
  }
  return {
    ok: false,
    title: "API unreachable",
    message: `Could not reach the API at ${getApiBaseUrl()}. Check that it is running.`,
  };
}
