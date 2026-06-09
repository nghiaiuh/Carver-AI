/*
 * Flow: Provides database access utilities.
 * 1. Read environment/client configuration.
 * 2. Create Supabase or Prisma helpers.
 * 3. Export shared DB primitives to apps.
 */

export { prisma } from "./prisma";
export {
  createBrowserSupabaseClient,
  getBrowserSupabaseClient,
} from "./supabase";
export { getSupabasePublicEnv } from "./env";

export type { Database, Tables, InsertTables, UpdateTables, Json } from "./types";
