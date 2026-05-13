import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// ─── Environment Variables ────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseAnonKey) {
  throw new Error(
    "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// ─── Public Client (anon key – dùng ở client-side / browser) ─────────────────
// Tuân theo Row Level Security (RLS) policies của Supabase
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
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
  }
);

// ─── Admin Client (service_role key – CHỈ dùng ở server-side) ────────────────
// Bỏ qua RLS, có toàn quyền trên database. KHÔNG expose ra client.
let _supabaseAdmin: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseServiceKey) {
    throw new Error(
      "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. " +
        "Admin client chỉ được dùng ở server-side."
    );
  }

  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient<Database>(supabaseUrl!, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: "public",
      },
    });
  }

  return _supabaseAdmin;
}

// ─── Helper: tạo client với JWT của user (server-side) ───────────────────────
// Dùng khi bạn muốn thực hiện thao tác với quyền của một user cụ thể
export function createServerClient(
  userAccessToken: string
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type { Database };
