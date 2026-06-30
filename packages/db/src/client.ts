/*
 * Flow: Provides database access utilities.
 * 1. Read environment/client configuration.
 * 2. Create Supabase or Prisma helpers.
 * 3. Export shared DB primitives to apps.
 */

export {
  createBrowserSupabaseClient,
  getBrowserSupabaseClient,
  getOptionalBrowserSupabaseClient,
} from "./supabase";

export type { Database, Tables, InsertTables, UpdateTables, Json } from "./types";
