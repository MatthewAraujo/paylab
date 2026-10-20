// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerApiClient, MissingApiKeyError } from "./server-client";

function stubFetch(body: unknown = { items: [], nextCursor: null }) {
  return vi.fn(async (_request: Request) =>
    Response.json(body, { status: 200 }),
  );
}

describe("createServerApiClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes server reads through the internal API address while preserving explicit overrides", async () => {
    vi.stubEnv("PAYLAB_INTERNAL_API_URL", "http://api:3333");
    vi.stubEnv("NEXT_PUBLIC_PAYLAB_API_URL", "http://localhost:3333");
    const fetch = stubFetch();
    await createServerApiClient({ apiKey: "k", fetch }).GET("/v1/accounts");
    expect(fetch.mock.calls[0][0].url).toBe("http://api:3333/v1/accounts");

    await createServerApiClient({
      apiKey: "k",
      baseUrl: "http://explicit.test",
      fetch,
    }).GET("/v1/accounts");
    expect(fetch.mock.calls[1][0].url).toBe("http://explicit.test/v1/accounts");
  });

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
