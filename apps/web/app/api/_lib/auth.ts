/*
 * Flow: Provides shared API-route helpers.
 * 1. Normalize request/auth inputs.
 * 2. Expose small utilities used by server routes.
 * 3. Keep API handlers concise and consistent.
 */

import { NextResponse } from "next/server";
import {
  createUserSupabaseClient,
  getAuthenticatedUser,
} from "@carver/db/server";

export const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
};

export const getRequestContext = async (request: Request) => {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await getAuthenticatedUser(accessToken);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    user,
    supabase: createUserSupabaseClient(accessToken),
  };
};
