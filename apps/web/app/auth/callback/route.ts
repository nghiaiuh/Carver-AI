import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@carver/db/client";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(nextPath, requestUrl.origin);
  let response = NextResponse.redirect(redirectUrl, 302);

  if (!code) return response;

  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers = {}) {
        // Keep the PKCE verifier/session in cookies so the exchange stays on
        // the server and the authorization code never reaches application UI.
        response = NextResponse.redirect(redirectUrl, 302);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?auth_error=callback_failed", requestUrl.origin), 302);
  }

  return response;
}
