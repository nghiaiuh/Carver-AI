import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

export const createBrowserSupabaseClient = (): SupabaseClient<Database> => {
  const { url, anonKey } = getSupabasePublicEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
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

export type { Database };
