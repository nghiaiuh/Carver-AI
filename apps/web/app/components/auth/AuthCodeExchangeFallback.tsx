"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearAuthCredentialsFromUrl,
  getAuthRedirectPath,
  getBrowserAuthClient,
} from "./authClient";

export default function AuthCodeExchangeFallback() {
  const router = useRouter();
  const hasHandledCode = useRef(false);

  useEffect(() => {
    if (hasHandledCode.current) return;

    const searchParams = new URLSearchParams(window.location.search);
    const authorizationCode = searchParams.get("code");
    if (!authorizationCode) return;

    hasHandledCode.current = true;
    const supabase = getBrowserAuthClient();

    // Complete the PKCE hand-off without rendering a separate callback screen.
    clearAuthCredentialsFromUrl();
    if (!supabase) return;

    void supabase.auth.exchangeCodeForSession(authorizationCode).then(({ error }) => {
      if (!error) {
        router.replace(getAuthRedirectPath(searchParams.get("next")));
      }
    });
  }, [router]);

  return null;
}
