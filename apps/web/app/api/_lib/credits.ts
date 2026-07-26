import { apiFailure } from "./http";
import type { RequestContext } from "./authz";
import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger, notifyOperationalAlert } from "@carver/shared";

const logger = createSafeLogger("api.credits");

export const AI_CREDIT_COSTS = {
  chat: 2,
  promptEnhance: 1,
  generateConcept: 5,
  refineConcept: 5,
} as const;

type CreditMutationResult =
  | { creditsRemaining: number; applied: boolean }
  | { error: ReturnType<typeof apiFailure> };

function creditFailureCode(message: string) {
  if (/insufficient_credits/i.test(message)) {
    return "INSUFFICIENT_CREDITS";
  }

  if (/profile_not_found/i.test(message)) {
    return "PROFILE_NOT_INITIALIZED";
  }

  if (/consume_profile_credits|restore_profile_credits|schema cache|does not exist/i.test(message)) {
    return "CREDIT_RPC_MISSING";
  }

  return "CREDIT_MUTATION_FAILED";
}

function creditFailureStatus(message: string) {
  if (/insufficient_credits/i.test(message)) {
    return 403;
  }

  if (/profile_not_found/i.test(message)) {
    return 404;
  }

  return 500;
}

function publicCreditFailureCode(code: ReturnType<typeof creditFailureCode>) {
  if (code === "INSUFFICIENT_CREDITS" || code === "PROFILE_NOT_INITIALIZED") {
    return code;
  }

  // Keep database/RPC implementation details in logs and alerts only.
  return "CREDIT_SERVICE_UNAVAILABLE";
}

function creditFailureMessage(code: ReturnType<typeof creditFailureCode>) {
  if (code === "INSUFFICIENT_CREDITS") {
    return "Not enough credits.";
  }

  if (code === "PROFILE_NOT_INITIALIZED") {
    return "Profile credits are not initialized for this account.";
  }

  if (code === "CREDIT_RPC_MISSING") {
    // Schema/RPC names are operational detail. The safe logger retains the
    // original database error with the requestId for support investigation.
    return "Credits are temporarily unavailable. Please try again later.";
  }

  return "Unable to update credits.";
}

export async function reserveUserCredits(
  context: RequestContext,
  amount: number,
  operationKey: string,
  reason: "chat" | "prompt_enhance" | "generation",
): Promise<CreditMutationResult> {
  const rpcClient = context.supabase as typeof context.supabase & {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{
      data: { credits_remaining?: unknown; applied?: unknown }[] | null;
      error: { message?: string } | null;
    }>;
  };
  const { data, error } = await rpcClient.rpc("consume_profile_credits", {
    p_amount: amount,
    p_idempotency_key: operationKey,
    p_reason: reason,
  });

  const result = data?.[0];
  if (error || typeof result?.credits_remaining !== "number" || typeof result.applied !== "boolean") {
    const message = error?.message || "Unable to update credits.";
    const code = creditFailureCode(message);
    const publicCode = publicCreditFailureCode(code);
    const status = creditFailureStatus(message);
    logger.error("credit mutation failed", {
      requestId: context.requestId,
      userId: context.user.id,
      operation: reason,
      errorCode: code,
      error,
    });
    if (status >= 500) {
      void notifyOperationalAlert({
        event: "credit_mutation_failed",
        severity: "error",
        cooldownKey: `credit_mutation_failed:${code}`,
        metadata: {
          requestId: context.requestId,
          userId: context.user.id,
          operation: reason,
          errorCode: code,
        },
      });
    }
    return {
      error: apiFailure(
        publicCode,
        creditFailureMessage(code),
        status,
        context.requestId,
      ),
    };
  }

  return {
    creditsRemaining: result.credits_remaining,
    applied: result.applied,
  };
}

export async function restoreUserCredits(
  context: RequestContext,
  amount: number,
  operationKey: string,
) {
  const supabase = getSupabaseAdmin();
  const rpcClient = supabase as typeof supabase & {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { error } = await rpcClient.rpc("restore_profile_credits", {
    p_user_id: context.user.id,
    p_amount: amount,
    p_idempotency_key: `refund:${operationKey}`,
    p_reason: "refund",
  });

  if (error) {
    throw new Error(error.message || "Unable to restore credits.");
  }
}
