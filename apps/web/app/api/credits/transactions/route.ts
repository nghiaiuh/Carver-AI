import { apiFailure, apiSuccess } from "../../_lib/http";
import { requireRequestContext } from "../../_lib/authz";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function pageSize(value: string | null) {
  if (!value) return DEFAULT_PAGE_SIZE;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_PAGE_SIZE
    ? parsed
    : null;
}

function beforeCursor(value: string | null) {
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Read-only owner-scoped ledger history for account and future billing UI. */
export async function GET(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;

  const url = new URL(request.url);
  const limit = pageSize(url.searchParams.get("limit"));
  const before = beforeCursor(url.searchParams.get("before"));
  if (!limit || before === undefined) {
    return apiFailure("BAD_REQUEST", "Pagination parameters are invalid.", 400, context.requestId);
  }

  let query = context.supabase
    .from("credit_ledger")
    .select("id, amount, balance_after, reason, created_at")
    .eq("profile_id", context.user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    return apiFailure("CREDIT_HISTORY_UNAVAILABLE", "Unable to load credit history.", 500, context.requestId);
  }

  const rows = data ?? [];
  const entries = rows.slice(0, limit).map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    balanceAfter: entry.balance_after,
    reason: entry.reason,
    createdAt: entry.created_at,
  }));
  const nextCursor = rows.length > limit ? entries.at(-1)?.createdAt ?? null : null;

  return apiSuccess({ entries, nextCursor });
}
