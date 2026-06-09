/*
 * Flow: Handles an HTTP API route for Carver AI.
 * 1. Read and validate the incoming request.
 * 2. Run the route-specific server logic.
 * 3. Return a typed JSON response for the frontend.
 */

import { NextResponse } from "next/server";
import { getRequestContext } from "../_lib/auth";
import { serverError } from "../_lib/http";

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { supabase, user } = context;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, plan_type, credits_amount, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error) {
    return serverError();
  }

  return NextResponse.json({ profile });
}
