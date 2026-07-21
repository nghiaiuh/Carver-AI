"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  clearAuthCredentialsFromUrl,
  getAuthRedirectPath,
  getBrowserAuthClient,
  getLegacyHashSession,
  normalizeNextPath,
} from "./authClient";

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasCompleted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = normalizeNextPath(searchParams.get("next"));
  const authorizationCode = searchParams.get("code");

  useEffect(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;

    const completeAuthentication = async () => {
      const supabase = getBrowserAuthClient();
      if (!supabase) {
        clearAuthCredentialsFromUrl();
        setError("Supabase is not configured yet.");
        return;
      }

      const legacySession = getLegacyHashSession();
      // Remove credentials from the address bar immediately after reading them.
      clearAuthCredentialsFromUrl();

      if (authorizationCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authorizationCode);
        if (exchangeError) {
          setError(exchangeError.message || "This sign-in link is invalid or has expired.");
          return;
        }
      } else if (legacySession) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: legacySession.accessToken,
          refresh_token: legacySession.refreshToken,
        });
        if (sessionError) {
          setError(sessionError.message || "This sign-in link is invalid or has expired.");
          return;
        }
      } else {
        setError("This sign-in link is invalid or has expired.");
        return;
      }

      router.replace(getAuthRedirectPath(nextPath));
    };

    void completeAuthentication();
  }, [authorizationCode, nextPath, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f5ee] px-5 text-[#101412]">
      <section className="w-full max-w-md rounded-[1.5rem] border border-black/10 bg-white p-8 shadow-[0_20px_60px_rgba(16,20,18,0.12)]">
        {error ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#B42318]">Sign-in unavailable</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em]">We could not complete your sign-in.</h1>
            <p className="mt-3 text-sm leading-6 text-black/60">{error}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex rounded-full bg-[#101412] px-5 py-3 text-sm font-bold text-[#f8f5ee]"
            >
              Return to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#27683f]">Secure sign-in</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em]">Completing your workspace access</h1>
            <p className="mt-3 text-sm leading-6 text-black/60">Your credentials are being stored securely and removed from the browser address bar.</p>
          </>
        )}
      </section>
    </main>
  );
}
