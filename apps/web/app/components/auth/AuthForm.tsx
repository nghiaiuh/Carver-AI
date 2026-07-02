"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  buildAuthPageHref,
  buildOAuthRedirectUrl,
  getAuthRedirectPath,
  getBrowserAuthClient,
  normalizeNextPath,
} from "./authClient";
import { useAuthSession } from "./useAuthSession";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
  nextPath?: string;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.22 1.26-.96 2.33-2.06 3.05l3.33 2.58c1.94-1.79 3.06-4.42 3.06-7.55 0-.72-.06-1.41-.18-2.08H12z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.33-2.58c-.92.62-2.1.99-3.28.99-2.52 0-4.66-1.7-5.42-3.98l-3.44 2.65A9.98 9.98 0 0 0 12 22z" />
      <path fill="#4A90E2" d="M6.58 13.99A6 6 0 0 1 6.28 12c0-.69.12-1.35.3-1.99L3.14 7.36A9.98 9.98 0 0 0 2 12c0 1.62.39 3.15 1.14 4.64l3.44-2.65z" />
      <path fill="#FBBC05" d="M12 6.03c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.95 2.99 14.7 2 12 2a9.98 9.98 0 0 0-8.86 5.36l3.44 2.65C7.34 7.73 9.48 6.03 12 6.03z" />
    </svg>
  );
}

export default function AuthForm({ mode, nextPath: rawNextPath }: AuthFormProps) {
  const router = useRouter();
  const { status } = useAuthSession();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  const nextPath = normalizeNextPath(rawNextPath);

  useEffect(() => {
    if (status !== "authenticated") return;
    router.replace(getAuthRedirectPath(nextPath));
  }, [nextPath, router, status]);

  const isRegister = mode === "register";

  const submitLabel = isRegister ? "Create account" : "Sign in";
  const switchHref = isRegister
    ? buildAuthPageHref("/login", nextPath)
    : buildAuthPageHref("/register", nextPath);

  const switchLabel = isRegister
    ? "Already have an account? Sign in"
    : "Need an account? Create one";

  const handleGoogleAuth = async () => {
    const supabase = getBrowserAuthClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    setError(null);
    setInfo(null);
    setOauthLoading(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildOAuthRedirectUrl(isRegister ? "/register" : "/login", nextPath),
      },
    });

    if (oauthError) {
      setOauthLoading(false);
      setError(oauthError.message || "Unable to start Google sign-in.");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const supabase = getBrowserAuthClient();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        return;
      }

      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: buildOAuthRedirectUrl("/login", nextPath),
          },
        });

        if (signUpError) {
          setError(signUpError.message || "Unable to create your account.");
          return;
        }

        if (!data.session) {
          setInfo("Check your email to confirm your account, then sign in.");
          return;
        }

        router.replace(getAuthRedirectPath(nextPath));
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Unable to sign in.");
        return;
      }

      router.replace(getAuthRedirectPath(nextPath));
    });
  };

  return (
    <div>
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-black/42">
          {isRegister ? "Register" : "Login"}
        </p>
        <h2 className="text-3xl font-black tracking-[-0.04em] text-[#101412]">
          {isRegister ? "Create your Carver AI workspace" : "Sign in to continue your design flow"}
        </h2>
        <p className="text-sm leading-6 text-black/60">
          {isRegister
            ? "Save projects, use the preset library, and keep your canvas work tied to your own account."
            : "Access your projects, preset library, and generation context from one workspace."}
        </p>
      </div>

      <div className="mt-7 space-y-5">
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={oauthLoading || isPending}
          className="inline-flex w-full items-center justify-center gap-3 rounded-[1.1rem] border border-black/10 bg-[#101412] px-4 py-3.5 text-sm font-bold text-[#f8f5ee] shadow-[0_14px_32px_rgba(16,20,18,0.15)] transition hover:bg-[#1a221f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
          {isRegister ? "Continue with Google" : "Sign in with Google"}
        </button>

        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-black/32">
          <span className="h-px flex-1 bg-black/10" />
          Or with email
          <span className="h-px flex-1 bg-black/10" />
        </div>

        {(error || info) && (
          <div
            className={[
              "flex items-start gap-3 rounded-[1.1rem] border px-4 py-3 text-sm leading-6",
              error
                ? "border-[#B42318]/20 bg-[#FEF3F2] text-[#7A271A]"
                : "border-[#27683f]/20 bg-[#effbea] text-[#27683f]",
            ].join(" ")}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{error ?? info}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[#101412]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-medium text-[#101412] outline-none transition placeholder:text-black/28 focus:border-[#101412] focus:ring-4 focus:ring-black/5"
              placeholder="you@studio.com"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[#101412]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-medium text-[#101412] outline-none transition placeholder:text-black/28 focus:border-[#101412] focus:ring-4 focus:ring-black/5"
              placeholder={isRegister ? "Create a password" : "Enter your password"}
            />
          </label>

          {isRegister ? (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#101412]">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="h-12 w-full rounded-[1rem] border border-black/10 bg-white px-4 text-sm font-medium text-[#101412] outline-none transition placeholder:text-black/28 focus:border-[#101412] focus:ring-4 focus:ring-black/5"
                placeholder="Repeat your password"
              />
            </label>
          ) : null}

          {!isRegister ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm font-semibold text-black/48 transition hover:text-[#101412]"
                onClick={() => setInfo("Password reset can be added next. Use Google sign-in or create a new password flow later.")}
              >
                Forgot password?
              </button>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isPending || oauthLoading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[1rem] border border-black/10 bg-[#f0eadf] px-4 text-sm font-black text-[#101412] transition hover:bg-[#e7e0d4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitLabel}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link href={switchHref} className="font-semibold text-[#101412] underline decoration-black/18 underline-offset-4 transition hover:decoration-black/60">
          {switchLabel}
        </Link>
        <span className="text-xs text-black/36">Protected by Supabase Auth</span>
      </div>
    </div>
  );
}
