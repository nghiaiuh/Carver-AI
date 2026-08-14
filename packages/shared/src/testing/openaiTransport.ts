import type { OpenAIHttpTransport } from "../openai-transport";

export type CapturedOpenAIRequest = {
  url: string;
  init: RequestInit;
};

export type OpenAITransportFixture =
  | Response
  | Error
  | ((request: CapturedOpenAIRequest) => Response | Error | Promise<Response | Error>);

export const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9oN2VNcAAAAASUVORK5CYII=";

export const openAIJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Deterministic, queued transport for adapter tests. It never performs I/O
 * and preserves every request for contract assertions.
 */
export function createQueuedOpenAITransport(fixtures: OpenAITransportFixture[]) {
  const queue = [...fixtures];
  const requests: CapturedOpenAIRequest[] = [];

  const transport: OpenAIHttpTransport = async (input, init) => {
    const request = { url: String(input), init };
    requests.push(request);
    const next = queue.shift();

    if (!next) {
      throw new Error("OpenAI test transport received an unexpected request.");
    }

    const resolved = typeof next === "function" ? await next(request) : next;
    if (resolved instanceof Error) {
      throw resolved;
    }

    return resolved;
  };

  return { transport, requests };
}
