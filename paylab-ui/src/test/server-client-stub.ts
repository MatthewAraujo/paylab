import createClient from "openapi-fetch";
import { vi } from "vitest";
import type { paths } from "@/api/generated/schema";

// Controlled HTTP at the network boundary: the real typed client runs against this stub fetch.
export const fetchStub = vi.fn<(request: Request) => Promise<Response>>();

let keyMissing = false;
export function setKeyMissing(value: boolean) {
  keyMissing = value;
}

/** Use as: vi.mock("@/api/server-client", () => serverClientModule()) */
export async function serverClientModule() {
  const actual = await vi.importActual<typeof import("@/api/server-client")>(
    "@/api/server-client",
  );
  return {
    ...actual,
    createServerApiClient: () => {
      if (keyMissing) throw new actual.MissingApiKeyError();
      return createClient<paths>({
        baseUrl: "http://api.test",
        fetch: fetchStub,
      });
    },
  };
}
