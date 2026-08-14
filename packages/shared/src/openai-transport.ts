/**
 * Server-side transport seam for OpenAI adapters. Browser code must never
 * instantiate this transport or attach credentials to it.
 */
export type OpenAIHttpTransport = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;
