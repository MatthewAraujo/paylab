import { vi } from "vitest";

// Controlled HTTP at the network boundary for the benchmark surface: the real typed client runs
// against this stub fetch, which routes by method and path, records every request, and answers
// loudly (501) for anything that was not stubbed. Test-only: never imported by production code.

export type StubContext = {
  request: Request;
  /** Path parameters of the matched route, decoded. */
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body, or undefined when there is none. */
  body: unknown;
};

export type Responder =
  | Response
  | ((context: StubContext) => Response | Promise<Response>);

export type RecordedRequest = {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** A responder that fails like a browser does when the server cannot be reached. */
export function networkFailure(message = "Failed to fetch") {
  return (): Response => {
    throw new TypeError(message);
  };
}

type Route = { method: string; segments: string[]; responder: Responder };

const split = (path: string) => path.split("/").filter(Boolean);

function match(segments: string[], path: string[]) {
  if (segments.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of segments.entries()) {
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeURIComponent(path[index]);
    } else if (segment !== path[index]) {
      return null;
    }
  }
  return params;
}

export function createBenchmarkApiStub() {
  const routes = new Map<string, Route>();
  const requests: RecordedRequest[] = [];
  const unmatched: string[] = [];

  async function readBody(request: Request): Promise<unknown> {
    const text = await request.clone().text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  const stub = {
    requests,
    unmatched,

    /** Register or replace the responder of one method and path pattern (`/v1/x/:id`). */
    on(method: string, path: string, responder: Responder) {
      const upper = method.toUpperCase();
      routes.set(`${upper} ${path}`, {
        method: upper,
        segments: split(path),
        responder,
      });
      return stub;
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const path = split(url.pathname).map((part) => part);
      const body = await readBody(request);
      const method = request.method.toUpperCase();

      requests.push({
        method,
        url: request.url,
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers,
        body,
      });

      for (const route of [...routes.values()].reverse()) {
        if (route.method !== method) continue;
        const params = match(route.segments, path);
        if (!params) continue;
        const { responder } = route;
        return typeof responder === "function"
          ? responder({ request, params, query: url.searchParams, body })
          : responder.clone();
      }

      unmatched.push(`${method} ${url.pathname}`);
      return json({ message: `No stub for ${method} ${url.pathname}` }, 501);
    },

    /** Route the global `fetch` to this stub (undo with `vi.unstubAllGlobals()`). */
    install() {
      vi.stubGlobal("fetch", stub.fetch);
      return stub;
    },
  };

  return stub;
}

export type BenchmarkApiStub = ReturnType<typeof createBenchmarkApiStub>;
