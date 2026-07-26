/*
 * Flow: Provides shared API-route helpers.
 * 1. Normalize request/auth inputs.
 * 2. Expose small utilities used by server routes.
 * 3. Keep API handlers concise and consistent.
 */

import {
  createUserSupabaseClient,
  getAuthenticatedUser,
} from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { apiFailure, createRequestId } from "./http";

const logger = createSafeLogger("web.api.auth");

export const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
};

export const getRequestContext = async (request: Request) => {
  const requestId = createRequestId(request);
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      error: apiFailure("AUTH_REQUIRED", "Unauthorized", 401, requestId),
    };
  }

  try {
    const user = await getAuthenticatedUser(accessToken);
    if (!user) {
      return {
        error: apiFailure("AUTH_REQUIRED", "Unauthorized", 401, requestId),
      };
    }

    return {
      user,
      supabase: createUserSupabaseClient(accessToken),
      requestId,
    };
  } catch (error) {
    // Do not turn an Auth infrastructure outage into a raw framework error or
    // a misleading 401. The safe logger keeps only redacted diagnostics.
    logger.error("request authentication service failed", { requestId, error });
    return {
      error: apiFailure(
        "AUTH_SERVICE_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
        503,
        requestId,
      ),
    };
  }
};
