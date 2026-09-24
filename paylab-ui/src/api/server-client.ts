import createClient from "openapi-fetch";
import { getApiBaseUrl } from "@/lib/env";
import type { paths } from "./generated/schema";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "PAYLAB_API_KEY is not set. Provision a Merchant with `pnpm merchant:provision` in paylab-api and set the key in the server environment.",
    );
    this.name = "MissingApiKeyError";
  }
}

type ServerApiClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: (request: Request) => Promise<Response>;
};

/**
 * Typed client for the PayLab API that authenticates as one Merchant. The key comes from
 * a server-only environment variable (no `NEXT_PUBLIC_` prefix), so it is never bundled
 * for the browser. Call this only from Server Components and route handlers.
 */
export function createServerApiClient(options: ServerApiClientOptions = {}) {
  if (typeof window !== "undefined") {
    throw new Error("The PayLab API key client must not run in the browser.");
  }

  const apiKey = (
    "apiKey" in options ? options.apiKey : process.env.PAYLAB_API_KEY
  )?.trim();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  return createClient<paths>({
    baseUrl: options.baseUrl ?? getApiBaseUrl(),
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}
