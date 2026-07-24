import type { RequestContext } from "./authz";
import { createSafeLogger } from "@carver/shared";
import { apiFailure } from "./http";

export const API_RATE_LIMIT_SCOPES = [
  "ai-job",
  "chat",
  "library-upload",
  "project-create",
  "project-draft-finalize",
  "project-draft-save",
  "prompt-enhance",
  "snapshot-asset-upload",
] as const;

export type ApiRateLimitScope = (typeof API_RATE_LIMIT_SCOPES)[number];

type RateLimitOptions = {
  scope: ApiRateLimitScope;
  limit: number;
  windowMs: number;
};

type RateLimitRpcRow = {
  allowed: boolean;
  reset_at: string;
  remaining: number;
};

const logger = createSafeLogger("api.rate-limit");

/** Uses a DB atomic upsert so the limit is shared by every web instance. */
export async function enforceRateLimit(
  context: RequestContext,
  options: RateLimitOptions,
): Promise<{ ok: true; remaining: number; resetAt: string } | { ok: false; response: ReturnType<typeof apiFailure> }> {
  const rpcClient = context.supabase as typeof context.supabase & {
    rpc: (
      fn: "consume_api_rate_limit",
      params: Record<string, unknown>,
    ) => Promise<{ data: RateLimitRpcRow[] | null; error: { message?: string } | null }>;
  };

  const { data, error } = await rpcClient.rpc("consume_api_rate_limit", {
    p_scope: options.scope,
    p_limit: options.limit,
    p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
  });
  const result = data?.[0];

  if (error || !result) {
    logger.error("rate limit backend unavailable", {
      requestId: context.requestId,
      userId: context.user.id,
      scope: options.scope,
      error,
    });
    return {
      ok: false,
      response: apiFailure("RATE_LIMIT_UNAVAILABLE", "Unable to process this request right now.", 503, context.requestId),
    };
  }

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000),
    );
    return {
      ok: false,
      response: apiFailure(
        "RATE_LIMITED",
        "Too many requests. Please try again shortly.",
        429,
        context.requestId,
        { headers: { "Retry-After": String(retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true, remaining: result.remaining, resetAt: result.reset_at };
}
