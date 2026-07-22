/*
 * Flow: Provides database access utilities.
 * 1. Read environment/client configuration.
 * 2. Create Supabase or Prisma helpers.
 * 3. Export shared DB primitives to apps.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

export const createBrowserSupabaseClient = (): SupabaseClient<Database> => {
  const { url, anonKey } = getSupabasePublicEnv();

  return createBrowserClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The server callback exchanges PKCE codes before rendering a page.
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-application-name": "carver-ai",
      },
    },
  });
};

export const getBrowserSupabaseClient = (): SupabaseClient<Database> => {
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient();
  }

  return browserClient;
};

export const getOptionalBrowserSupabaseClient = (): SupabaseClient<Database> | null => {
  try {
    return getBrowserSupabaseClient();
  } catch {
    return null;
  }
};

export type { Database };
