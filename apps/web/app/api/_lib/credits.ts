import { apiFailure } from "./http";
import type { RequestContext } from "./authz";

export const AI_CREDIT_COSTS = {
  chat: 2,
  promptEnhance: 1,
  generateConcept: 5,
  refineConcept: 5,
} as const;

type CreditMutationResult =
  | { creditsRemaining: number }
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

function creditFailureMessage(message: string) {
  if (/insufficient_credits/i.test(message)) {
    return "Not enough credits.";
  }

  if (/profile_not_found/i.test(message)) {
    return "Profile credits are not initialized for this account.";
  }

  if (/consume_profile_credits|restore_profile_credits|schema cache|does not exist/i.test(message)) {
    return "Credits system is not initialized on the database yet. Apply migration 006_profile_credit_rpcs.sql.";
  }

  return "Unable to update credits.";
}

export async function reserveUserCredits(
  context: RequestContext,
  amount: number,
): Promise<CreditMutationResult> {
  const rpcClient = context.supabase as typeof context.supabase & {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("consume_profile_credits", {
    p_amount: amount,
  });

  if (error || typeof data !== "number") {
    const message = error?.message || "Unable to update credits.";
    return {
      error: apiFailure(
        creditFailureCode(message),
        creditFailureMessage(message),
        creditFailureStatus(message),
        context.requestId,
      ),
    };
  }

  return { creditsRemaining: data };
}

export async function restoreUserCredits(
  context: RequestContext,
  amount: number,
) {
  const rpcClient = context.supabase as typeof context.supabase & {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  await rpcClient.rpc("restore_profile_credits", {
    p_amount: amount,
  });
}
