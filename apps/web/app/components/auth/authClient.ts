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

export function buildOAuthRedirectUrl(pathname: "/login" | "/register", nextPath?: string | null) {
  const url = new URL(pathname, window.location.origin);
  const normalizedNext = normalizeNextPath(nextPath);
  if (normalizedNext !== "/") {
    url.searchParams.set("next", normalizedNext);
  }
  return url.toString();
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
