"use client";

import { useEffect, useRef } from "react";
import {
  clearAuthCredentialsFromUrl,
  getBrowserAuthClient,
} from "./authClient";

export default function AuthCodeExchangeFallback() {
  const hasHandledCode = useRef(false);

  useEffect(() => {
    if (hasHandledCode.current || window.location.pathname === "/auth/callback") return;

    const authorizationCode = new URLSearchParams(window.location.search).get("code");
    if (!authorizationCode) return;

    hasHandledCode.current = true;
    const supabase = getBrowserAuthClient();

    // A misconfigured Supabase redirect can fall back to the site URL. Complete
    // the PKCE flow here as a safe fallback and remove the code immediately.
    clearAuthCredentialsFromUrl();
    if (!supabase) return;

    void supabase.auth.exchangeCodeForSession(authorizationCode);
  }, []);

  return null;
}
