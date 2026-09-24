// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createServerApiClient, MissingApiKeyError } from "./server-client";

function stubFetch(body: unknown = { items: [], nextCursor: null }) {
  return vi.fn(async (_request: Request) =>
    Response.json(body, { status: 200 }),
  );
}

describe("createServerApiClient", () => {
  it("sends the Merchant API key as a Bearer token", async () => {
    const fetch = stubFetch();
    const client = createServerApiClient({
      apiKey: "pk_test_123",
      baseUrl: "http://api.test",
      fetch,
    });

    await client.GET("/v1/accounts");

    const request = fetch.mock.calls[0][0];
    expect(request.url).toBe("http://api.test/v1/accounts");
    expect(request.headers.get("Authorization")).toBe("Bearer pk_test_123");
  });

  it("fails explicitly when no API key is configured, without any fallback", () => {
    expect(() =>
      createServerApiClient({ apiKey: undefined, baseUrl: "http://api.test" }),
    ).toThrow(MissingApiKeyError);
    expect(() =>
      createServerApiClient({ apiKey: "  ", baseUrl: "http://api.test" }),
    ).toThrow(/PAYLAB_API_KEY/);
  });

  it("never caches financial reads", async () => {
    const fetch = stubFetch();
    const client = createServerApiClient({
      apiKey: "k",
      baseUrl: "http://api.test",
      fetch,
    });

    await client.GET("/v1/payments");

    expect(fetch.mock.calls[0][0].cache).toBe("no-store");
  });
});
