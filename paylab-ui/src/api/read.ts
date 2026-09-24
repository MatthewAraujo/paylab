import {
  type ApiFailure,
  failureFromResponse,
  failureFromThrown,
} from "./failures";
import { createServerApiClient } from "./server-client";

export type ReadResult<T> = { ok: true; data: T } | ApiFailure;

type ServerApiClient = ReturnType<typeof createServerApiClient>;

/**
 * Runs one typed GET on the server-side client. Every failure (no key, rejected key,
 * unreachable API, HTTP error) becomes a message the operator can act on; nothing is thrown.
 */
export async function readApi<T>(
  subject: string,
  call: (
    client: ServerApiClient,
  ) => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ReadResult<T>> {
  try {
    const { data, error, response } = await call(createServerApiClient());
    return data === undefined
      ? failureFromResponse(response, error, subject)
      : { ok: true, data };
  } catch (error) {
    return failureFromThrown(error);
  }
}
