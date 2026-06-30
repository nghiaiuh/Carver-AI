/*
 * Route: API profile cua user dang dang nhap.
 * Thuoc: module user profile / account.
 * Vai tro: cung cap thong tin ho so co ban de frontend hien thi plan, credit va profile.
 * Chuc nang:
 * - `GET`: doc profile cua chinh user hien tai tu Supabase.
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
