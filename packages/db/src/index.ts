// ─── Prisma (local / self-hosted Postgres) ────────────────────────────────────
export { prisma } from "./prisma";

// ─── Supabase (online database via REST API) ──────────────────────────────────
export {
  supabase,
  getSupabaseAdmin,
  createServerClient,
} from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
export type { Database, Tables, InsertTables, UpdateTables, Json } from "./types";
