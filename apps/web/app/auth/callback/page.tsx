import { Suspense } from "react";
import AuthCallback from "../../components/auth/AuthCallback";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f8f5ee]" />}>
      <AuthCallback />
    </Suspense>
  );
}
