"use client";

import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { getOptionalBrowserSupabaseClient } from "@carver/db/client";
import type { Database } from "@carver/db/client";

export type AuthSessionState =
  | { status: "loading"; session: null }
  | { status: "authenticated"; session: Session }
  | { status: "anonymous"; session: null };

export function getBrowserAuthClient(): SupabaseClient<Database> | null {
  return getOptionalBrowserSupabaseClient();
}

export function normalizeNextPath(value: string | null | undefined) {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

export function getAuthRedirectPath(nextPath?: string | null) {
  return normalizeNextPath(nextPath);
}

export function buildAuthPageHref(pathname: "/login" | "/register", nextPath?: string | null, source?: string) {
  const params = new URLSearchParams();
  const normalizedNext = normalizeNextPath(nextPath);
  if (normalizedNext !== "/") params.set("next", normalizedNext);
  if (source) params.set("source", source);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildAuthCallbackUrl(nextPath?: string | null) {
  // Keep the PKCE hand-off invisible: the landing page exchanges the code in
  // the background, then moves the user directly to their intended workspace.
  const url = new URL("/", window.location.origin);
  const normalizedNext = normalizeNextPath(nextPath);
  if (normalizedNext !== "/") {
    url.searchParams.set("next", normalizedNext);
  }
  return url.toString();
}

type LegacyHashSession = {
  accessToken: string;
  refreshToken: string;
};

export function getLegacyHashSession(): LegacyHashSession | null {
  if (typeof window === "undefined" || !window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export function clearAuthCredentialsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("access_token");
  url.searchParams.delete("refresh_token");
  url.searchParams.delete("provider_token");
  url.searchParams.delete("token_type");
  url.searchParams.delete("expires_at");
  url.searchParams.delete("expires_in");

  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}`);
}

export function subscribeToAuthSession(
  callback: (state: AuthSessionState, event: AuthChangeEvent) => void,
) {
  const client = getBrowserAuthClient();
  if (!client) {
    callback({ status: "anonymous", session: null }, "INITIAL_SESSION");
    return () => {};
  }

  let active = true;

  client.auth.getSession().then(({ data }) => {
    if (!active) return;
    const session = data.session;
    callback(
      session
        ? { status: "authenticated", session }
        : { status: "anonymous", session: null },
      "INITIAL_SESSION",
    );
  });

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(
      session
        ? { status: "authenticated", session }
        : { status: "anonymous", session: null },
      event,
    );
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}
