import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServerEnv } from "./env";
import type { Database } from "./types";

const assertServerOnly = () => {
  if (typeof window !== "undefined") {
    throw new Error("Server Supabase helpers cannot run in the browser.");
  }
};

let adminClient: SupabaseClient<Database> | null = null;

export const getSupabaseAdmin = (): SupabaseClient<Database> => {
  assertServerOnly();

  const { url, serviceRoleKey } = getSupabaseServerEnv();

  if (!adminClient) {
    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: "public",
      },
      global: {
        headers: {
          "x-application-name": "carver-ai-server",
        },
      },
    });
  }

  return adminClient;
};

export const createUserSupabaseClient = (
  accessToken: string
): SupabaseClient<Database> => {
  assertServerOnly();

  const { url, anonKey } = getSupabasePublicEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "public",
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-application-name": "carver-ai-user-server",
      },
    },
  });
};

export const getAuthenticatedUser = async (accessToken: string) => {
  const client = createUserSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return data.user;
};
